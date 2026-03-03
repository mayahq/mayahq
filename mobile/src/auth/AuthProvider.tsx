import React, { createContext, useContext } from 'react'
import { useAuth, AuthState } from './useAuth'

// Create the context with a default value matching AuthState but with all functions doing nothing
const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signOut: async () => {},
  refreshSession: async () => {}
})

// Hook to use auth context
export const useAuthContext = () => useContext(AuthContext)

// Provider component
export const AuthProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  // Use our hook to get auth state
  const auth = useAuth()

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  )
} 