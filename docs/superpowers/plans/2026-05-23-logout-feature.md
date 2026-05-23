# Logout Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an end-to-end logout capability — a backend `POST /api/v1/logout` endpoint that clears the refresh-token cookie, plus a frontend dropdown menu item that calls it and tears down local session state.

**Architecture:** Stateless logout. Backend handler clears the httpOnly `refreshToken` cookie and returns 204; no token blacklist, no DB write. Frontend calls the endpoint best-effort, then unconditionally clears `localStorage.accessToken`, resets the Zustand stores, and redirects to `/auth/login`. A Headless UI `Menu` dropdown anchored on the existing `UserCircleIcon` in the header is the entry point.

**Tech Stack:** Go 1.x + Gin (backend), Next.js 14 + React 18 + Zustand + Headless UI + TailwindCSS/DaisyUI (frontend), Axios for HTTP, Cypress for component tests, `testify` for Go tests.

**Spec:** `docs/superpowers/specs/2026-05-23-logout-feature-design.md`

---

## File Structure

**Backend (`store-service`)**
- Modify `cmd/api/auth.go` — add `LogoutHandler` method on `AuthAPI`
- Create `cmd/api/auth_test.go` — handler tests (file does not exist today)
- Modify `cmd/main.go` — register `POST /api/v1/logout` route

**Frontend (`store-web`)**
- Modify `src/services/auth.ts` — add `Logout()` service
- Modify `src/hooks/use-order-store.ts` — add `resetOrder()` action
- Create `src/layouts/common/components/user-menu.tsx` — new Headless UI dropdown component (logout entry point)
- Modify `src/layouts/common/components/right-menu.tsx` — render `<UserMenu />` instead of bare `<UserCircleIcon />` when authed
- Create `src/__test__/components/user-menu.cy.tsx` — Cypress component test for the dropdown

**Why split `user-menu.tsx` out of `right-menu.tsx`?** `right-menu.tsx` is currently a thin composition file. Putting the dropdown, click handler, store calls, and routing into it would conflate three concerns. A focused `UserMenu` component is easier to test in isolation via Cypress (stub services, assert store mutations) and keeps `right-menu.tsx` declarative.

---

## Task 1: Backend — `LogoutHandler` (TDD)

**Files:**
- Create: `store-service/cmd/api/auth_test.go`
- Modify: `store-service/cmd/api/auth.go` (append new method after `LoginHandler`)

- [ ] **Step 1: Write the failing tests**

Create `store-service/cmd/api/auth_test.go` with this content:

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

func Test_LogoutHandler_Should_Clear_Refresh_Cookie_And_Return_204(t *testing.T) {
	api := AuthAPI{}

	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/logout", nil)
	req.AddCookie(&http.Cookie{Name: "refreshToken", Value: "some-token"})
	ctx.Request = req

	api.LogoutHandler(ctx)

	assert.Equal(t, http.StatusNoContent, w.Code)

	setCookie := w.Header().Get("Set-Cookie")
	assert.True(t, strings.HasPrefix(setCookie, "refreshToken="),
		"expected Set-Cookie to clear refreshToken, got %q", setCookie)
	assert.Contains(t, setCookie, "Max-Age=0",
		"expected Max-Age=0 to invalidate cookie, got %q", setCookie)
	assert.Contains(t, setCookie, "Path=/")
	assert.Contains(t, setCookie, "HttpOnly")
}

func Test_LogoutHandler_Without_Cookie_Should_Still_Return_204(t *testing.T) {
	api := AuthAPI{}

	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/v1/logout", nil)

	api.LogoutHandler(ctx)

	assert.Equal(t, http.StatusNoContent, w.Code)
	setCookie := w.Header().Get("Set-Cookie")
	assert.Contains(t, setCookie, "refreshToken=")
	assert.Contains(t, setCookie, "Max-Age=0")
}
```

- [ ] **Step 2: Run tests — expect compile failure**

Run: `cd store-service && go test -v ./cmd/api/ -run Test_LogoutHandler`

Expected: build failure with message like `api.AuthAPI.LogoutHandler undefined`. This confirms TDD red.

- [ ] **Step 3: Implement `LogoutHandler`**

Append this method to `store-service/cmd/api/auth.go` (after `LoginHandler`, before the end of file):

```go
// LogoutHandler godoc
// @Summary Logout
// @Description Clears the refresh-token cookie. Idempotent — succeeds even if no cookie is present.
// @Tags auth
// @Success 204
// @Router /logout [post]
func (api AuthAPI) LogoutHandler(context *gin.Context) {
	ctx := context.Request.Context()
	ip := context.ClientIP()

	slog.InfoContext(ctx, "Logout",
		"log_type", "audit",
		"action", "logout",
		"actor_ip", ip,
	)

	context.SetCookie("refreshToken", "", -1, "/", "", false, true)
	context.Status(http.StatusNoContent)
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `cd store-service && go test -v ./cmd/api/ -run Test_LogoutHandler`

Expected: both tests PASS. Output should contain `--- PASS: Test_LogoutHandler_Should_Clear_Refresh_Cookie_And_Return_204` and `--- PASS: Test_LogoutHandler_Without_Cookie_Should_Still_Return_204`.

- [ ] **Step 5: Run full unit test suite to catch regressions**

Run: `cd store-service && go test ./...`

Expected: all tests pass (PASS summary, no FAIL lines).

- [ ] **Step 6: Commit**

```bash
git add store-service/cmd/api/auth.go store-service/cmd/api/auth_test.go
git commit -m "[Added] LogoutHandler that clears refreshToken cookie and returns 204"
```

---

## Task 2: Backend — Register `/logout` route

**Files:**
- Modify: `store-service/cmd/main.go:232-233`

- [ ] **Step 1: Add the route registration**

In `store-service/cmd/main.go`, find these two lines:

```go
v1.GET("/refreshToken", authAPI.RefreshTokenHandler)
v1.POST("/login", authAPI.LoginHandler)
```

Add a third line directly underneath:

```go
v1.POST("/logout", authAPI.LogoutHandler)
```

The result should read:

```go
v1.GET("/refreshToken", authAPI.RefreshTokenHandler)
v1.POST("/login", authAPI.LoginHandler)
v1.POST("/logout", authAPI.LogoutHandler)
```

The route is registered on `v1` (the public group, no JWT middleware) — logout must work with an expired access token.

- [ ] **Step 2: Build to verify**

Run: `cd store-service && go build ./...`

Expected: no output (success). If it fails, the handler signature in Task 1 doesn't match what `v1.POST` expects (`gin.HandlerFunc`).

- [ ] **Step 3: Smoke test against a running server (optional but recommended)**

In one terminal: `make store_service_dev_mode`

In another:
```bash
curl -i -X POST http://localhost:8000/api/v1/logout
```

Expected: `HTTP/1.1 204 No Content` and a `Set-Cookie: refreshToken=; Path=/; Max-Age=0; HttpOnly` header. Stop the dev server with Ctrl+C.

- [ ] **Step 4: Regenerate Swagger docs**

Run: `make gen-swagger`

Expected: command completes successfully. `store-service/cmd/docs/` files are updated to include the new `/logout` route.

- [ ] **Step 5: Commit**

```bash
git add store-service/cmd/main.go store-service/cmd/docs/
git commit -m "[Added] Register POST /api/v1/logout route and regenerate swagger"
```

---

## Task 3: Frontend — `Logout()` service

**Files:**
- Modify: `store-web/src/services/auth.ts` (append after `RefreshToken`)

- [ ] **Step 1: Add the `Logout` function**

In `store-web/src/services/auth.ts`, append this **at the end of the file** (after the closing `}` of `RefreshToken`):

```ts
export type LogoutResponse = { status: number }

export const Logout = async (): Promise<LogoutResponse> => {
  try {
    const response = await authAxiosInstance.post(`/api/v1/logout`)
    return { status: response.status }
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      return { status: error.response.status }
    }
    return { status: 0 }
  }
}
```

The function reuses the existing `authAxiosInstance` (created at the top of the file) which already sets `withCredentials: true`, so the `refreshToken` cookie travels automatically. It does **not** use the shared `utils/axios.ts` instance — that one has a 401→refresh interceptor that would race with our teardown.

- [ ] **Step 2: Lint to verify**

Run: `cd store-web && npm run lint`

Expected: no errors related to `services/auth.ts`. Pre-existing warnings in unrelated files are acceptable.

- [ ] **Step 3: Commit**

```bash
git add store-web/src/services/auth.ts
git commit -m "[Added] Logout service that calls POST /api/v1/logout"
```

---

## Task 4: Frontend — `resetOrder()` on `useOrderStore`

**Files:**
- Modify: `store-web/src/hooks/use-order-store.ts`

- [ ] **Step 1: Extract initial state as a constant**

In `store-web/src/hooks/use-order-store.ts`, locate the `create<OrderStoreType>()(...)` block (starts around line 84). The current shape inlines initial state inside `devtools((set, get) => ({ cart: [], summary: {...}, ... }))`.

Refactor so initial state is a named constant, allowing both the initial set and `resetOrder()` to use it. Replace the existing `create` call (lines 84-253) with this:

```ts
const initialOrderState = {
  cart: [] as ProductDetailInCart[],
  summary: {
    total_price: 0,
    total_price_thb: 0,
    total_price_full_thb: 0,
    receive_point: 0
  },
  totalProduct: 0,
  totalPayment: 0,
  receivePoint: 0,
  shipping: {
    shippingMethod: SHIPPING_METHOD[0].id,
    shippingFee: SHIPPING_METHOD[0].price,
    shippingInformation: {
      firstName: '',
      lastName: '',
      address: '',
      mobileNumber: '',
      provinceId: 0,
      districtId: 0,
      subDistrictId: 0,
      provinceName: '',
      districtName: '',
      subDistrictName: '',
      zipCode: 0,
      focused: ''
    }
  },
  point: {
    point: 0,
    burnPoint: 0,
    isUsePoint: false
  },
  payment: {
    paymentMethod: 1,
    paymentCreditInformation: {
      number: '',
      name: '',
      expiry: '',
      cvv: '',
      issuer: '',
      focused: ''
    }
  }
}

const useOrderStore = create<OrderStoreType>()(
  devtools((set, get) => ({
    ...initialOrderState,
    getProductListInCart: async () => {
      // Mock userId
      const productInCart = await GetProductInCartService()

      if (productInCart.data) {
        set(
          produce((state) => {
            state.totalProduct = productInCart.data?.carts.length
            state.cart = productInCart.data?.carts
            state.summary = productInCart.data?.summary

            state.subTotal = productInCart.data?.summary.total_price_thb
            state.totalPayment = productInCart.data?.summary.total_price_thb
          })
        )
      }

      // Reset Discount Point
      set(
        produce((state) => {
          state.point.burnPoint = 0
          state.point.isUsePoint = false
        })
      )

      get().updateSummary()
    },
    setPoint(point: number) {
      set(
        produce((state) => {
          state.point.point = point
        })
      )
    },
    setIsUsePoint: (isUsePoint: boolean) => {
      set(
        produce((state) => {
          state.point.isUsePoint = isUsePoint
        })
      )

      get().updateSummary()
    },
    setPaymentMethod: (paymentMethod: string) => {
      set(
        produce((state) => {
          state.payment.paymentMethod = paymentMethod
        })
      )
    },
    setPaymentInformation: (
      paymentCreditInformation: PaymentCreditInformationType
    ) => {
      set(
        produce((state) => {
          state.payment.paymentCreditInformation = paymentCreditInformation
        })
      )
    },
    setShippingMethod: (shippingMethod: number, shippingFee: number) => {
      const newTotalPayment = get().summary.total_price_thb + shippingFee

      set(
        produce((state) => {
          state.totalPayment = newTotalPayment
          state.shipping.shippingMethod = shippingMethod
          state.shipping.shippingFee = shippingFee
        })
      )

      get().updateSummary()
    },
    setShippingInformation: (shippingInformation: ShippingInformationType) => {
      set(
        produce((state) => {
          state.shipping.shippingInformation = shippingInformation
        })
      )
    },
    updateSummary: async () => {
      const isUsePoint = get().point.isUsePoint
      const point = get().point.point

      const subTotal = get().summary.total_price_thb
      const shippingFee = get().shipping.shippingFee

      // priceCalculate Point
      const pointsUsed = isUsePoint
        ? priceCalculate.pointBurn(point, subTotal)
        : 0

      // Total Payment
      const totalPayment = priceCalculate.totalPayment(
        isUsePoint,
        pointsUsed,
        subTotal,
        shippingFee
      )

      const totalWithOutShipping = totalPayment - shippingFee

      // Point Receive
      const receivePoint = pointCalulate.receiptPoint(totalWithOutShipping)

      set(
        produce((state) => {
          state.totalPayment = totalPayment
          state.receivePoint = receivePoint
          state.point.burnPoint = pointsUsed
        })
      )
    },
    resetOrder: () => set(initialOrderState)
  }))
)
```

- [ ] **Step 2: Add `resetOrder` to the type**

In the same file, find `type OrderStoreType` (around line 62). Add this line inside the type, after `updateSummary: () => void`:

```ts
  resetOrder: () => void
```

The resulting block looks like:

```ts
  setShippingInformation: (shippingInformation: ShippingInformationType) => void
  updateSummary: () => void
  resetOrder: () => void
}
```

- [ ] **Step 3: Lint to verify**

Run: `cd store-web && npm run lint`

Expected: no errors related to `hooks/use-order-store.ts`.

- [ ] **Step 4: Type-check by building**

Run: `cd store-web && npm run build`

Expected: build succeeds. If TypeScript errors mention missing `resetOrder` on `OrderStoreType`, recheck Step 2.

- [ ] **Step 5: Commit**

```bash
git add store-web/src/hooks/use-order-store.ts
git commit -m "[Added] resetOrder action on useOrderStore for logout teardown"
```

---

## Task 5: Frontend — `UserMenu` component (TDD via Cypress)

**Files:**
- Create: `store-web/src/layouts/common/components/user-menu.tsx`
- Create: `store-web/src/__test__/components/user-menu.cy.tsx`

- [ ] **Step 1: Write the failing Cypress component test**

Create `store-web/src/__test__/components/user-menu.cy.tsx`:

```tsx
import UserMenu from '../../layouts/common/components/user-menu'
import { useUserStore } from '../../hooks/use-user-store'
import * as authService from '../../services/auth'

describe('<UserMenu />', () => {
  beforeEach(() => {
    useUserStore.setState({
      user: {
        userId: 1,
        firstName: 'Phongsaton',
        lastName: 'Untan',
        username: 'phong'
      }
    })
    localStorage.setItem('accessToken', 'fake-token')
  })

  afterEach(() => {
    useUserStore.setState({ user: null })
    localStorage.removeItem('accessToken')
  })

  it('renders the user avatar trigger', () => {
    cy.mount(<UserMenu />)
    cy.get('#user-menu-button').should('be.visible')
  })

  it('shows Logout when the menu opens', () => {
    cy.mount(<UserMenu />)
    cy.get('#user-menu-button').click()
    cy.get('#logout-button').should('be.visible').and('have.text', 'Logout')
  })

  it('clears user store and accessToken when Logout is clicked', () => {
    cy.stub(authService, 'Logout').resolves({ status: 204 }).as('logout')

    cy.mount(<UserMenu />)
    cy.get('#user-menu-button').click()
    cy.get('#logout-button').click()

    cy.get('@logout').should('have.been.calledOnce')
    cy.window().then((win) => {
      expect(win.localStorage.getItem('accessToken')).to.be.null
    })
    cy.then(() => {
      expect(useUserStore.getState().user).to.be.null
    })
  })
})
```

- [ ] **Step 2: Run the test — expect import failure**

Run: `cd store-web && npm run test:component -- --spec "src/__test__/components/user-menu.cy.tsx"`

Expected: failure with a module-not-found error for `user-menu`. This is TDD red.

- [ ] **Step 3: Implement `UserMenu`**

Create `store-web/src/layouts/common/components/user-menu.tsx`:

```tsx
'use client'

import { useUserStore } from '@/hooks/use-user-store'
import useOrderStore from '@/hooks/use-order-store'
import { Logout } from '@/services/auth'
import { Menu, Transition } from '@headlessui/react'
import { UserCircleIcon } from '@heroicons/react/16/solid'
import { useRouter } from 'next/navigation'
import { Fragment } from 'react'

const UserMenu = () => {
  const user = useUserStore((state) => state.user)
  const clearUser = useUserStore((state) => state.clearUser)
  const resetOrder = useOrderStore((state) => state.resetOrder)
  const router = useRouter()

  const handleLogout = async () => {
    await Logout()
    localStorage.removeItem('accessToken')
    clearUser()
    resetOrder()
    router.push('/auth/login')
  }

  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button
        id="user-menu-button"
        className="flex justify-center items-center gap-1"
      >
        <UserCircleIcon className="h-7 w-7 text-gray-800" />
        {user && (
          <span className="hidden sm:inline text-sm text-gray-800">
            {user.firstName}
          </span>
        )}
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-32 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none z-10">
          <Menu.Item>
            {({ active }) => (
              <button
                id="logout-button"
                type="button"
                onClick={handleLogout}
                className={`${
                  active ? 'bg-gray-100' : ''
                } block w-full text-left px-4 py-2 text-sm text-gray-700`}
              >
                Logout
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}

export default UserMenu
```

- [ ] **Step 4: Run the test — expect pass**

Run: `cd store-web && npm run test:component -- --spec "src/__test__/components/user-menu.cy.tsx"`

Expected: all three tests pass. If the third test fails because `router.push` throws inside Cypress component mount (Next router not available), wrap the mount in a Next router mock — but try the test as-is first; Headless UI + Cypress Next bundler typically tolerates `useRouter()`.

If `router.push` throws inside the test environment, change `handleLogout` to:

```tsx
const handleLogout = async () => {
  await Logout()
  localStorage.removeItem('accessToken')
  clearUser()
  resetOrder()
  try {
    router.push('/auth/login')
  } catch {
    // router not available in component-test environment
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add store-web/src/layouts/common/components/user-menu.tsx store-web/src/__test__/components/user-menu.cy.tsx
git commit -m "[Added] UserMenu dropdown with Logout that clears session state"
```

---

## Task 6: Frontend — Wire `UserMenu` into `RightMenu`

**Files:**
- Modify: `store-web/src/layouts/common/components/right-menu.tsx`

- [ ] **Step 1: Replace the inline icon block with `<UserMenu />`**

Replace the entire contents of `store-web/src/layouts/common/components/right-menu.tsx` with:

```tsx
'use client'

import { useUserStore } from '@/hooks/use-user-store'
import Cart from '@/layouts/common/components/cart'
import Login from '@/layouts/common/components/login'
import UserMenu from '@/layouts/common/components/user-menu'
import { HeaderProps } from '@/layouts/common/header'

// ---------------------------------------------------

const RightMenu = ({ setShoppingCartOpen }: HeaderProps) => {
  const user = useUserStore((state) => state.user)
  return (
    <div className="flex flex-1 gap-x-10 justify-end">
      <Cart setShoppingCartOpen={setShoppingCartOpen} />
      {user ? <UserMenu /> : <Login />}
    </div>
  )
}

export default RightMenu
```

The `UserCircleIcon` import is dropped (now lives inside `UserMenu`).

- [ ] **Step 2: Lint to verify**

Run: `cd store-web && npm run lint`

Expected: no errors on `right-menu.tsx`. If a "no-unused-imports" lint error appears, double-check the import block matches the snippet above.

- [ ] **Step 3: Build to type-check**

Run: `cd store-web && npm run build`

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add store-web/src/layouts/common/components/right-menu.tsx
git commit -m "[Edited] Render UserMenu in RightMenu instead of inline avatar icon"
```

---

## Task 7: End-to-end manual verification

**Files:** none (manual verification only)

- [ ] **Step 1: Start the full stack**

Run: `make start_all`

Wait until all containers are up (check with `docker compose ps` — all should be `running` or `healthy`).

- [ ] **Step 2: Verify login still works**

Open `http://localhost` in a browser. Click Login (top right). Log in with seeded credentials (check `tearup/store/init.sql` for a valid username/password if needed). After login you should land on `/product/list`.

Expected: header shows the `UserCircleIcon` (and first name on wider screens). Both `accessToken` (localStorage) and `refreshToken` (cookie, HttpOnly — visible in DevTools → Application → Cookies) are set.

- [ ] **Step 3: Verify the logout dropdown opens**

Click the avatar icon in the header.

Expected: a small dropdown appears with a single "Logout" item.

- [ ] **Step 4: Verify logout tears down session**

Click "Logout".

Expected:
- Browser navigates to `/auth/login`.
- DevTools → Application → Local Storage: `accessToken` is gone, `user` slot in localStorage is `{"state":{"user":null},...}` or the key is gone.
- DevTools → Application → Cookies: `refreshToken` is gone (or has `Max-Age=0`).
- Network tab shows `POST /api/v1/logout` → `204`.

- [ ] **Step 5: Verify session cannot be silently restored**

After logging out, navigate to `/product/list` in the browser.

Expected: the user is treated as anonymous — `RightMenu` shows the Login button instead of the avatar. (The existing `utils/axios.ts` interceptor will try `/refreshToken` if any authed request fires, and it will fail because the cookie is cleared, redirecting back to `/auth/login`.)

- [ ] **Step 6: Tear down**

Run: `make down`

- [ ] **Step 7: Run the full unit suite one last time**

Run: `make unit_test_all`

Expected: all Go tests pass, all Jest tests pass, all Cypress component tests pass (including the new `user-menu.cy.tsx`).

---

## Verification summary

After all tasks:
- `cd store-service && go test ./...` → all pass (includes `Test_LogoutHandler_*`)
- `cd store-web && npm run lint` → clean
- `cd store-web && npm run build` → succeeds
- `cd store-web && npm run test:component` → all pass (includes `user-menu.cy.tsx`)
- Manual smoke test (Task 7) all green

No ATDD (Newman/Robot) coverage is added in this plan — the spec deliberately scoped it out. A follow-up plan can add `005-Logout.postman_collection.json` + Robot suite if desired.
