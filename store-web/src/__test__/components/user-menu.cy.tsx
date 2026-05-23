import UserMenu from '../../layouts/common/components/user-menu'
import { useUserStore } from '../../hooks/use-user-store'

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

  const mountUserMenu = () =>
    cy.mount(
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem' }}>
        <UserMenu />
      </div>
    )

  it('renders the user avatar trigger', () => {
    mountUserMenu()
    cy.get('#user-menu-button').should('be.visible')
  })

  it('shows Logout when the menu opens', () => {
    mountUserMenu()
    cy.get('#user-menu-button').click()
    cy.get('#logout-button').should('be.visible').and('have.text', 'Logout')
  })

  it('clears user store and accessToken when Logout is clicked', () => {
    cy.intercept('POST', '**/api/v1/logout', { statusCode: 204 }).as('logout')

    mountUserMenu()
    cy.get('#user-menu-button').click()
    cy.get('#logout-button').click()

    cy.wait('@logout')
    cy.window().then((win) => {
      expect(win.localStorage.getItem('accessToken')).to.be.null
    })
    cy.then(() => {
      expect(useUserStore.getState().user).to.be.null
    })
  })
})
