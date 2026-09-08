import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useCurrencyStore = create(
  persist(
    (set, get) => ({
      selectedCurrency: 'USD', // 'USD' | 'EUR'
      exchangeRate: null, // Tasa USD
      euroRate: null, // Tasa EUR
      exchangeLoading: false,
      lastExchangeRefresh: null,

      setCurrency: (currency) => set({ selectedCurrency: currency }),

      fetchRates: async () => {
        try {
          set({ exchangeLoading: true });
          const [usdRes, euroRes] = await Promise.all([
            fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
            fetch('https://ve.dolarapi.com/v1/euros/oficial')
          ]);

          if (!usdRes.ok || !euroRes.ok) throw new Error('API fallida');

          const [usdData, euroData] = await Promise.all([
            usdRes.json(),
            euroRes.json()
          ]);

          // Redondear a 2 decimales para consistencia
          const usdVal = Number((usdData.promedio || usdData.valor).toFixed(2));
          const euroVal = Number((euroData.promedio || euroData.valor).toFixed(2));

          set({
            exchangeRate: usdVal,
            euroRate: euroVal,
            lastExchangeRefresh: new Date().toISOString(),
            exchangeLoading: false,
          });
        } catch (error) {
          console.error('Error fetching exchange rates:', error);
          set({ exchangeLoading: false });
        }
      },

      // Helper para obtener la tasa activa
      getActiveRate: () => {
        const state = get();
        return state.selectedCurrency === 'USD' ? state.exchangeRate : state.euroRate;
      }
    }),
    {
      name: 'currency-storage',
      partialize: (state) => ({ selectedCurrency: state.selectedCurrency }),
    }
  )
);

export default useCurrencyStore;
