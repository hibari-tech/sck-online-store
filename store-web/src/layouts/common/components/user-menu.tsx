'use client'

import { useUserStore } from '@/hooks/use-user-store'
import useOrderStore from '@/hooks/use-order-store'
import { Logout } from '@/services/auth'
import { Menu } from '@headlessui/react'
import { UserCircleIcon } from '@heroicons/react/16/solid'
import { useRouter } from 'next/navigation'

const useSafeRouter = () => {
  try {
    return useRouter()
  } catch {
    return null
  }
}

const UserMenu = () => {
  const user = useUserStore((state) => state.user)
  const clearUser = useUserStore((state) => state.clearUser)
  const resetOrder = useOrderStore((state) => state.resetOrder)
  const router = useSafeRouter()

  const handleLogout = async () => {
    await Logout()
    localStorage.removeItem('accessToken')
    clearUser()
    resetOrder()
    router?.push('/auth/login')
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
      <Menu.Items className="absolute right-0 mt-2 w-32 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none z-10">
        <Menu.Item as="button"
          id="logout-button"
          type="button"
          onClick={handleLogout}
          className="block w-full text-left px-4 py-2 text-sm text-gray-700 ui-active:bg-gray-100"
        >
          Logout
        </Menu.Item>
      </Menu.Items>
    </Menu>
  )
}

export default UserMenu
