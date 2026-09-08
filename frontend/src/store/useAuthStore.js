import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  userProfile: null, // { uid, email, empresaId, rol, createdAt }
  loading: true,
  initialized: false,

  setUser: (user) => set({ user }),
  setUserProfile: (profile) => set({ userProfile: profile }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),

  logout: () => set({
    user: null,
    userProfile: null,
    loading: false,
  }),

  reset: () => set({
    user: null,
    userProfile: null,
    loading: true,
    initialized: false,
  }),
}));

export default useAuthStore;
