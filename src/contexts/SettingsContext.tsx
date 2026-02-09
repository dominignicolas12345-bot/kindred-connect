import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AppSettings {
  id: string;
  institution_name: string;
  monthly_fee_base: number;
  monthly_report_template: string;
  annual_report_template: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  institution_name: 'Logia',
  monthly_fee_base: 50,
  monthly_report_template: 'Este informe presenta el resumen financiero correspondiente al período indicado, con datos reales registrados en el sistema de tesorería.',
  annual_report_template: 'Este informe presenta el resumen financiero anual consolidado del período fiscal, incluyendo el detalle de ingresos, egresos y balance general.',
};

interface SettingsContextType {
  settings: AppSettings;
  loading: boolean;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  updateSettings: async () => {},
  refresh: async () => {},
});

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};

// Global settings cache for instant access across components
let globalSettings: AppSettings | null = null;
let settingsPromise: Promise<AppSettings> | null = null;
const subscribers = new Set<(settings: AppSettings) => void>();

async function fetchSettings(): Promise<AppSettings> {
  const timeout = 10000; // 10 second timeout
  
  try {
    const fetchPromise = async () => {
      // FIXED: Get the first settings row (not by id='default' since id is UUID)
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error loading settings:', error);
        return DEFAULT_SETTINGS;
      }

      if (!data) {
        // Insert default settings if not exists (let DB generate the UUID)
        const { data: inserted, error: insertError } = await supabase
          .from('settings')
          .insert([{
            institution_name: DEFAULT_SETTINGS.institution_name,
            monthly_fee_base: DEFAULT_SETTINGS.monthly_fee_base,
            monthly_report_template: DEFAULT_SETTINGS.monthly_report_template,
            annual_report_template: DEFAULT_SETTINGS.annual_report_template,
          }])
          .select()
          .single();
        
        if (insertError) {
          console.error('Error inserting default settings:', insertError);
          return DEFAULT_SETTINGS;
        }
        
        return {
          id: inserted?.id || DEFAULT_SETTINGS.id,
          institution_name: inserted?.institution_name || DEFAULT_SETTINGS.institution_name,
          monthly_fee_base: inserted?.monthly_fee_base ?? DEFAULT_SETTINGS.monthly_fee_base,
          monthly_report_template: inserted?.monthly_report_template || DEFAULT_SETTINGS.monthly_report_template,
          annual_report_template: inserted?.annual_report_template || DEFAULT_SETTINGS.annual_report_template,
        };
      }

      return {
        id: data.id,
        institution_name: data.institution_name || DEFAULT_SETTINGS.institution_name,
        monthly_fee_base: data.monthly_fee_base ?? DEFAULT_SETTINGS.monthly_fee_base,
        monthly_report_template: data.monthly_report_template || DEFAULT_SETTINGS.monthly_report_template,
        annual_report_template: data.annual_report_template || DEFAULT_SETTINGS.annual_report_template,
      };
    };

    const timeoutPromise = new Promise<AppSettings>((resolve) => {
      setTimeout(() => resolve(DEFAULT_SETTINGS), timeout);
    });

    return await Promise.race([fetchPromise(), timeoutPromise]);
  } catch (error) {
    console.error('Error in fetchSettings:', error);
    return DEFAULT_SETTINGS;
  }
}

function notifySubscribers(settings: AppSettings) {
  subscribers.forEach(fn => fn(settings));
}

export async function getGlobalSettings(): Promise<AppSettings> {
  if (globalSettings) return globalSettings;
  if (settingsPromise) return settingsPromise;
  
  settingsPromise = fetchSettings();
  globalSettings = await settingsPromise;
  settingsPromise = null;
  return globalSettings;
}

export async function refreshGlobalSettings(): Promise<AppSettings> {
  globalSettings = null;
  settingsPromise = null;
  const settings = await getGlobalSettings();
  notifySubscribers(settings);
  return settings;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(globalSettings || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!globalSettings);

  useEffect(() => {
    // Subscribe to settings changes
    const subscriber = (newSettings: AppSettings) => {
      setSettings(newSettings);
    };
    subscribers.add(subscriber);

    // Load initial settings with error handling
    if (globalSettings) {
      setSettings(globalSettings);
      setLoading(false);
    } else {
      getGlobalSettings()
        .then(s => {
          setSettings(s);
          setLoading(false);
        })
        .catch(() => {
          setSettings(DEFAULT_SETTINGS);
          setLoading(false);
        });
    }

    return () => {
      subscribers.delete(subscriber);
    };
  }, []);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    // Ensure we have a valid UUID before attempting update
    const currentId = settings.id;
    if (!currentId || currentId === 'default') {
      // Try to fetch the real settings first
      const freshSettings = await refreshGlobalSettings();
      if (!freshSettings.id || freshSettings.id === 'default') {
        throw new Error('No se encontró configuración válida en la base de datos');
      }
      // Now use the fresh settings id
      const newSettings = { ...freshSettings, ...updates };
      setSettings(newSettings);
      globalSettings = newSettings;
      notifySubscribers(newSettings);

      const { error } = await supabase
        .from('settings')
        .update({
          institution_name: updates.institution_name,
          monthly_fee_base: updates.monthly_fee_base,
          monthly_report_template: updates.monthly_report_template,
          annual_report_template: updates.annual_report_template,
          updated_at: new Date().toISOString(),
        })
        .eq('id', freshSettings.id);

      if (error) {
        console.error('Error saving settings:', error);
        await refreshGlobalSettings();
        throw error;
      }
      
      await refreshGlobalSettings();
      return;
    }

    const newSettings = { ...settings, ...updates };
    
    // Optimistic update
    setSettings(newSettings);
    globalSettings = newSettings;
    notifySubscribers(newSettings);

    // Update by the actual UUID id stored in settings
    const { error } = await supabase
      .from('settings')
      .update({
        institution_name: updates.institution_name,
        monthly_fee_base: updates.monthly_fee_base,
        monthly_report_template: updates.monthly_report_template,
        annual_report_template: updates.annual_report_template,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentId);

    if (error) {
      console.error('Error saving settings:', error);
      // Rollback on error
      await refreshGlobalSettings();
      throw error;
    }
    
    // Force refresh to ensure state is immediately updated across the app
    await refreshGlobalSettings();
  }, [settings]);

  const refresh = useCallback(async () => {
    const newSettings = await refreshGlobalSettings();
    setSettings(newSettings);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}
