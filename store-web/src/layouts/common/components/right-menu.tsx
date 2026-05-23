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
