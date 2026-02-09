import { useState, useEffect, useRef, forwardRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileText, Settings2, Loader2, Upload } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { useDataCache } from '@/hooks/useDataCache';
import { supabase } from '@/integrations/supabase/client';
import { getFiscalYearInfo } from '@/lib/dateUtils';

const Settings = forwardRef<HTMLDivElement>(function Settings(_props, ref) {
  const { toast } = useToast();
  const { settings, updateSettings, loading: settingsLoading } = useSettings();
  const { summary, members, loading: cacheLoading } = useDataCache();
  
  const [monthlyFee, setMonthlyFee] = useState(settings.monthly_fee_base.toString());
  const [institutionName, setInstitutionName] = useState(settings.institution_name);
  const [monthlyReportTemplate, setMonthlyReportTemplate] = useState(settings.monthly_report_template);
  const [annualReportTemplate, setAnnualReportTemplate] = useState(settings.annual_report_template);
  const [selectedTreasurerId, setSelectedTreasurerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingTreasurerSig, setUploadingTreasurerSig] = useState(false);
  const [uploadingVMSig, setUploadingVMSig] = useState(false);
  const [treasurerSigPreview, setTreasurerSigPreview] = useState<string | null>(null);
  const [vmSigPreview, setVMSigPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const treasurerSigRef = useRef<HTMLInputElement>(null);
  const vmSigRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMonthlyFee(settings.monthly_fee_base.toString());
    setInstitutionName(settings.institution_name);
    setMonthlyReportTemplate(settings.monthly_report_template || '');
    setAnnualReportTemplate(settings.annual_report_template || '');
    // Load current treasurer and signatures
    const loadExtras = async () => {
      const { data } = await supabase.from('settings').select('treasurer_id, treasurer_signature_url, vm_signature_url').limit(1).maybeSingle();
      if (data) {
        setSelectedTreasurerId((data as any).treasurer_id || '');
        setTreasurerSigPreview((data as any).treasurer_signature_url || null);
        setVMSigPreview((data as any).vm_signature_url || null);
      }
    };
    loadExtras();
  }, [settings]);

  const { currentCalendarYear, nextCalendarYear } = getFiscalYearInfo();
  const initialBalance = summary ? summary.balance : 0;

  // Get active members for treasurer selection
  const activeMembers = members.filter(m => m.status === 'activo');

  const handleSaveFinancial = async () => {
    setSaving(true);
    try {
      await updateSettings({ monthly_fee_base: parseFloat(monthlyFee), institution_name: institutionName });
      toast({ title: 'Configuracion guardada', description: 'Los parametros han sido actualizados' });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron guardar los parametros', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleSaveReportTemplates = async () => {
    setSaving(true);
    try {
      await updateSettings({ monthly_report_template: monthlyReportTemplate, annual_report_template: annualReportTemplate });
      toast({ title: 'Plantillas guardadas' });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron guardar las plantillas', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleSaveTreasurer = async () => {
    setSaving(true);
    try {
      // First remove old treasurer flag
      await supabase.from('members').update({ is_treasurer: false }).eq('is_treasurer', true);
      // Set new treasurer
      if (selectedTreasurerId) {
        await supabase.from('members').update({ is_treasurer: true }).eq('id', selectedTreasurerId);
      }
      // Save to settings
      await supabase.from('settings').update({ 
        treasurer_id: selectedTreasurerId || null, 
        updated_at: new Date().toISOString() 
      } as any).eq('id', settings.id);
      toast({ title: 'Tesorero actualizado' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Solo se permiten archivos de imagen', variant: 'destructive' });
      return;
    }
    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName);
      await supabase.from('settings').update({ logo_url: urlData.publicUrl, updated_at: new Date().toISOString() } as any).eq('id', settings.id);
      toast({ title: 'Logo actualizado' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo subir el logo', variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSignatureUpload = async (type: 'treasurer' | 'vm', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Solo se permiten archivos de imagen', variant: 'destructive' });
      return;
    }
    const setUploading = type === 'treasurer' ? setUploadingTreasurerSig : setUploadingVMSig;
    const setPreview = type === 'treasurer' ? setTreasurerSigPreview : setVMSigPreview;
    setUploading(true);
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-signature-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('signatures').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(fileName);
      const field = type === 'treasurer' ? 'treasurer_signature_url' : 'vm_signature_url';
      await supabase.from('settings').update({ [field]: urlData.publicUrl, updated_at: new Date().toISOString() } as any).eq('id', settings.id);
      setPreview(urlData.publicUrl);
      toast({ title: `Firma ${type === 'treasurer' ? 'del Tesorero' : 'del V.M.'} actualizada` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo subir la firma', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  if (settingsLoading && cacheLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuracion</h1>
        <p className="text-muted-foreground mt-1">Parametros de la aplicacion</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Parametros Generales */}
        <Card>
          <CardHeader>
            <CardTitle>Parametros Generales</CardTitle>
            <CardDescription>Configuracion institucional y financiera</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="institution-name">Nombre de la Institucion</Label>
              <Input id="institution-name" value={institutionName} onChange={e => setInstitutionName(e.target.value)} placeholder="Nombre de la logia" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-fee">Cuota Mensual Base ($)</Label>
              <Input id="monthly-fee" type="number" step="0.01" min="0" value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)} />
              <p className="text-xs text-muted-foreground">Valor por defecto de la cuota mensual</p>
            </div>
            <Button onClick={handleSaveFinancial} className="w-full" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Parametros'}
            </Button>
          </CardContent>
        </Card>

        {/* Logo Institucional */}
        <Card>
          <CardHeader>
            <CardTitle>Logo Institucional</CardTitle>
            <CardDescription>Reemplaza el logo por defecto. Visible en menu lateral y PDFs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg border bg-muted/50 flex items-center justify-center overflow-hidden">
                <img 
                  src={(settings as any).logo_url || '/placeholder.svg'} 
                  alt="Logo actual" 
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
              </div>
              <div className="flex-1">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo} className="w-full">
                  {uploadingLogo ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Subiendo...</> : <><Upload className="mr-2 h-4 w-4" /> Subir nuevo logo</>}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Formatos: JPG, PNG, SVG</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tesorero Activo */}
      <Card>
        <CardHeader>
          <CardTitle>Tesorero Activo por Periodo</CardTitle>
          <CardDescription>Seleccione quien ejerce actualmente el cargo de Tesorero</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tesorero actual</Label>
            <Select value={selectedTreasurerId} onValueChange={setSelectedTreasurerId}>
              <SelectTrigger><SelectValue placeholder="Seleccione un miembro" /></SelectTrigger>
              <SelectContent>
                {activeMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Este miembro aparecera como firmante en recibos, informes y comunicados</p>
          </div>
          <Button onClick={handleSaveTreasurer} className="w-full" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar Tesorero'}
          </Button>
        </CardContent>
      </Card>

      {/* Firmas Electronicas */}
      <Card>
        <CardHeader>
          <CardTitle>Firmas Electronicas</CardTitle>
          <CardDescription>Firmas que se usaran automaticamente en recibos, informes, comunicados y documentos de cierre</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Firma del Tesorero */}
            <div className="space-y-3">
              <Label>Firma del Tesorero</Label>
              <div className="w-full h-24 rounded-lg border bg-muted/50 flex items-center justify-center overflow-hidden">
                {treasurerSigPreview ? (
                  <img src={treasurerSigPreview} alt="Firma Tesorero" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">Sin firma cargada</span>
                )}
              </div>
              <input ref={treasurerSigRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleSignatureUpload('treasurer', e)} />
              <Button variant="outline" size="sm" className="w-full" onClick={() => treasurerSigRef.current?.click()} disabled={uploadingTreasurerSig}>
                {uploadingTreasurerSig ? 'Subiendo...' : 'Cargar firma del Tesorero'}
              </Button>
            </div>
            {/* Firma del V.M. */}
            <div className="space-y-3">
              <Label>Firma del Venerable Maestro</Label>
              <div className="w-full h-24 rounded-lg border bg-muted/50 flex items-center justify-center overflow-hidden">
                {vmSigPreview ? (
                  <img src={vmSigPreview} alt="Firma V.M." className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">Sin firma cargada</span>
                )}
              </div>
              <input ref={vmSigRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleSignatureUpload('vm', e)} />
              <Button variant="outline" size="sm" className="w-full" onClick={() => vmSigRef.current?.click()} disabled={uploadingVMSig}>
                {uploadingVMSig ? 'Subiendo...' : 'Cargar firma del V.M.'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Las firmas se aplicaran automaticamente en todos los documentos generados (recibos, informes, comunicados, documentos de cierre)</p>
        </CardContent>
      </Card>

      {/* Periodo Logial */}
      <Card>
        <CardHeader>
          <CardTitle>Periodo Logial</CardTitle>
          <CardDescription>Informacion del periodo logial actual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/50 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Periodo Logial:</span>
              <span className="font-bold">Julio {currentCalendarYear} - Junio {nextCalendarYear}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Mes de inicio:</span>
              <span className="font-medium">Julio {currentCalendarYear}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Mes de cierre:</span>
              <span className="font-medium">Junio {nextCalendarYear}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo inicial del periodo:</span>
              <span className={`font-bold ${initialBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                ${initialBalance.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              El saldo inicial se calcula automaticamente como: Total ingresos - Total gastos
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Plantillas de Informes */}
      <Card>
        <CardHeader>
          <CardTitle>Plantillas de Informes</CardTitle>
          <CardDescription>Texto institucional que aparece en los informes PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monthly-template">Texto para Informe Mensual</Label>
              <Textarea id="monthly-template" value={monthlyReportTemplate} onChange={e => setMonthlyReportTemplate(e.target.value)} rows={5} placeholder="Texto introductorio del informe mensual..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="annual-template">Texto para Informe Anual</Label>
              <Textarea id="annual-template" value={annualReportTemplate} onChange={e => setAnnualReportTemplate(e.target.value)} rows={5} placeholder="Texto introductorio del informe anual..." />
            </div>
          </div>
          <Button onClick={handleSaveReportTemplates} className="w-full" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar Plantillas de Informes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
});

export default Settings;
