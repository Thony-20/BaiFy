import { useEffect } from 'react';
import useAuthStore from '../store/useAuthStore';

export default function useAuth() {
  const {
    user,
    userProfile,
    loading,
    initialized,
    setUser,
    setUserProfile,
    setLoading,
    setInitialized,
    logout,
  } = useAuthStore();

  useEffect(() => {
    const checkAuth = () => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        const storedProfile = localStorage.getItem('profile');

        if (token && storedUser && storedProfile) {
            setUser(JSON.parse(storedUser));
            setUserProfile(JSON.parse(storedProfile));
        } else {
            logout();
        }
        setLoading(false);
        setInitialized(true);
    };

    checkAuth();
  }, [setUser, setUserProfile, logout, setLoading, setInitialized]);

  return { user, userProfile, loading, initialized };
}
