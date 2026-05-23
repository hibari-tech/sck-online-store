# Logout Feature — Design

**Date:** 2026-05-23
**Status:** Approved (pending spec review)
**Scope:** Add a logout capability to sck-online-store, covering both frontend UI and backend session revocation.

## Problem

The application has no logout. Users can log in (`POST /api/v1/login`) and silently refresh sessions (`GET /api/v1/refreshToken`), but there is no way to end a session — neither client-side (clear the access token) nor server-side (invalidate the refresh-token cookie). The header shows a `UserCircleIcon` placeholder when authenticated but does nothing on click.

## Goals

- Provide a discoverable logout action in the header for authenticated users.
- Invalidate both the client-side access token and the server-side refresh-token cookie so the session cannot be silently resurrected via `/refreshToken`.
- Reset in-memory user and cart state so a different user logging in afterward starts from a clean slate.
- Behave correctly when the access token is expired or the network is unavailable.

## Non-Goals

- Token blacklist / server-side revocation of issued access tokens. JWT access tokens (1-hour TTL) will continue to be valid until natural expiry. Stronger revocation can be revisited if a session-security incident motivates it.
- Multi-device logout ("log out everywhere"). Out of scope.
- Profile/account settings page. The dropdown will contain only "Logout" for now.
- Newman/Robot ATDD coverage for the new endpoint. Can be added later.

## Architecture

### Backend (`store-service`)

Add a new public route:

```
POST /api/v1/logout
```

- No JWT middleware — logout must succeed even with an expired access token.
- Handler clears the `refreshToken` cookie by issuing `Set-Cookie: refreshToken=; Max-Age=0; Path=/; HttpOnly`.
- Always returns `204 No Content`. Idempotent — calling without the cookie is also `204`.
- Cookie-clearing pattern matches the existing `RefreshTokenHandler` failure paths (`cmd/api/auth.go:55,75,90`): `context.SetCookie("refreshToken", "", -1, "/", "", false, true)`.

### Frontend (`store-web`)

- Add `Logout()` to `src/services/auth.ts` using the same standalone `authAxiosInstance` (with `withCredentials: true`) that `Login` and `RefreshToken` already use. **Do not** route this call through the shared `utils/axios.ts` instance — its 401→refresh interceptor would otherwise race with the logout teardown.
- Add a `clearUser()` action to `useUserStore` (persisted; `persist` middleware will wipe the localStorage slot automatically).
- Add a `resetOrder()` action to `useOrderStore` (in-memory; Immer reset to initial state).
- Replace the bare `UserCircleIcon` in `src/layouts/common/components/right-menu.tsx` with a Headless UI `Menu` dropdown containing one item: "Logout".

## Components & Contracts

### `POST /api/v1/logout`

| Aspect | Value |
|---|---|
| Auth | None required |
| Request body | (empty) |
| Cookies in | `refreshToken` (optional) |
| Response | `204 No Content` |
| Cookies out | `Set-Cookie: refreshToken=; Max-Age=0; Path=/; HttpOnly` |

Swagger annotation in the style of `LoginHandler` / `RefreshTokenHandler`.

### `services/auth.ts` — new `Logout`

```ts
export type LogoutResponse = { status: number }

export const Logout = async (): Promise<LogoutResponse>
```

- Uses `authAxiosInstance` (cookies travel via `withCredentials: true`).
- Returns `{ status }` from the response, or `{ status: 0 }` on network failure (best-effort).
- Never throws — the caller always proceeds with local cleanup.

### `hooks/use-user-store.ts` — add `clearUser`

Adds `clearUser: () => void` that sets `user` to `null`. The existing `persist` middleware writes the cleared state to localStorage automatically, so the `user` slot is wiped.

### `hooks/use-order-store.ts` — add `resetOrder`

Adds `resetOrder: () => void` that resets the store to its initial state via Immer. Wipes cart items, shipping selection, payment selection, points, and computed summary.

### `right-menu.tsx` — dropdown

Replaces the inline `<UserCircleIcon />` block with a Headless UI `<Menu>`:

- Trigger: `UserCircleIcon` (existing styling).
- Single `<Menu.Item>`: text "Logout" with `id="logout-button"` (kebab-case per project convention) to make ATDD targeting easy later.
- On click → runs the logout flow described in **Data Flow** below.

## Data Flow

```
User clicks "Logout"
  │
  ├─► POST /api/v1/logout       (best-effort, refreshToken cookie sent)
  │     backend: Set-Cookie refreshToken=""  →  204
  │
  ├─► localStorage.removeItem('accessToken')
  ├─► useUserStore.clearUser()
  ├─► useOrderStore.resetOrder()
  └─► router.push('/auth/login')
```

Local cleanup runs regardless of the network result. If the backend call fails (server down, offline), the user is still logged out from their perspective; the refresh cookie naturally expires after 30 days or gets overwritten on next login.

## Error Handling

| Scenario | Behavior |
|---|---|
| Network failure on `/logout` | `Logout()` swallows the error and returns `{ status: 0 }`. Local cleanup proceeds. |
| Backend response | Always `204`. No error branches on the server. |
| Concurrent in-flight authed requests | After `accessToken` is removed, any in-flight 401 hits the existing `utils/axios.ts` interceptor, which tries `/refreshToken` and fails (cookie cleared), then redirects to `/auth/login` via the existing path. No extra coordination needed. |
| Logout clicked while another logout is in flight | Idempotent — second click runs the same flow. No locking required. |

## Testing

### Backend (`store-service/cmd/api/auth_test.go`)

- `Test_LogoutHandler_Should_Clear_Refresh_Cookie_And_Return_204` — assert `204` and `Set-Cookie` header contains `refreshToken=` with `Max-Age=0`.
- `Test_LogoutHandler_Without_Cookie_Should_Still_Return_204` — call with no cookie; expect `204` and still emit a clearing `Set-Cookie` (idempotent contract).

### Frontend (`store-web/src/__test__/`)

- Cypress component test for `RightMenu`: when `useUserStore.user` is set, mounting renders the avatar; clicking opens the menu and shows "Logout"; clicking "Logout" (with `Logout` service stubbed) clears `useUserStore.user` and `localStorage.accessToken`.

### Not in scope for this change

- Newman API test for `/logout`. Optional follow-up.
- Robot Framework UI test for end-to-end logout. Optional follow-up.

## Files Touched

**Backend**
- `store-service/cmd/api/auth.go` — add `LogoutHandler`
- `store-service/cmd/api/auth_test.go` — add handler tests
- `store-service/cmd/main.go` — register `v1.POST("/logout", authAPI.LogoutHandler)`
- `store-service/cmd/docs/` — regenerated by `make gen-swagger`

**Frontend**
- `store-web/src/services/auth.ts` — add `Logout`
- `store-web/src/hooks/use-user-store.ts` — add `clearUser`
- `store-web/src/hooks/use-order-store.ts` — add `resetOrder`
- `store-web/src/layouts/common/components/right-menu.tsx` — replace icon with Headless UI `Menu`
- `store-web/src/__test__/` — component test for the dropdown + logout flow

## Open Questions

None — design approved by user on 2026-05-23.
