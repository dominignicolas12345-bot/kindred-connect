import { useEffect, useState, useMemo, useCallback, useRef, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Edit2, Zap, CreditCard, Search } from 'lucide-react';
import { ReceiptUpload } from '@/components/ui/receipt-upload';
import AdvancePaymentDialog from '@/components/treasury/AdvancePaymentDialog';
import { upsertCachedMonthlyPayment } from '@/hooks/useDataCache';
import { useSettings } from '@/contexts/SettingsContext';
import { getSystemDateString, getSystemYear, getSystemMonth, getFiscalYearInfo, FISCAL_MONTH_ORDER, MONTH_NAMES } from '@/lib/dateUtils';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

interface Member {
  id: string;
  full_name: string;
  degree: string | null;
  treasury_amount: number | null;
}

interface Payment {
  id: string;
  member_id: string;
  month: number;
  year: number;
  amount: number;
  paid_at: string | null;
  status?: string | null;
  receipt_url?: string | null;
  quick_pay_group_id?: string | null;
  payment_type?: string | null;
  created_at: string;
  updated_at?: string;
}

const MONTHS = FISCAL_MONTH_ORDER;

const GRADE_LABELS: Record<string, string> = {
  aprendiz: 'Aprendiz',
  companero: 'Companero',
  maestro: 'Maestro',
};

const Treasury = forwardRef<HTMLDivElement>(function Treasury(_props, ref) {
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Record<string, Payment>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<{
    memberId: string; memberName: string; monthIndex: number; month: number; year: number; payment?: Payment;
  } | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const [showQuickPay, setShowQuickPay] = useState<{
    memberId: string; memberName: string; defaultAmount: number;
  } | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayDate, setQuickPayDate] = useState('');
  const [quickPayReceipt, setQuickPayReceipt] = useState<File | null>(null);
  const [processingQuickPay, setProcessingQuickPay] = useState(false);

  const [showAdvancePayment, setShowAdvancePayment] = useState<{
    memberId: string; memberName: string; memberMonthlyAmount: number;
  } | null>(null);
  const [processingAdvancePayment, setProcessingAdvancePayment] = useState(false);

  const { toast } = useToast();
  const { settings } = useSettings();
  
  const { fiscalYear, currentCalendarYear, nextCalendarYear } = getFiscalYearInfo();
  const currentYear = fiscalYear;
  const systemMonth = getSystemMonth();
  const systemYear = getSystemYear();
  const currentMonthName = MONTH_NAMES[systemMonth - 1];
  
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) { loadData(); loadedRef.current = true; }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [membersResult, paymentsResult] = await Promise.all([
      supabase.from('members').select('id, full_name, degree, treasury_amount').eq('status', 'activo').order('full_name'),
      supabase.from('monthly_payments').select('*')
    ]);
    if (membersResult.data) setMembers(membersResult.data);
    if (paymentsResult.data) {
      const paymentsMap: Record<string, Payment> = {};
      paymentsResult.data.forEach(payment => {
        const key = `${payment.member_id}-${payment.month}-${payment.year}`;
        paymentsMap[key] = payment as Payment;
      });
      setPayments(paymentsMap);
    }
    setLoading(false);
  }, []);

  const filteredMembers = useMemo(() => {
    if (!searchTerm.trim()) return members;
    const term = searchTerm.toLowerCase();
    return members.filter(m => m.full_name.toLowerCase().includes(term));
  }, [members, searchTerm]);

  const getPaymentKey = useCallback((memberId: string, monthIndex: number) => {
    const year = monthIndex < 6 ? currentCalendarYear : nextCalendarYear;
    const month = monthIndex < 6 ? monthIndex + 7 : monthIndex - 5;
    return `${memberId}-${month}-${year}`;
  }, [currentCalendarYear, nextCalendarYear]);

  const getMonthYear = useCallback((monthIndex: number) => {
    const year = monthIndex < 6 ? currentCalendarYear : nextCalendarYear;
    const month = monthIndex < 6 ? monthIndex + 7 : monthIndex - 5;
    return { month, year };
  }, [currentCalendarYear, nextCalendarYear]);

  const totalAdeudado = useMemo(() => {
    const result: Record<string, number> = {};
    filteredMembers.forEach(member => {
      const memberFee = member.treasury_amount || settings.monthly_fee_base;
      let adeudado = 0;
      for (let i = 0; i < 12; i++) {
        const key = getPaymentKey(member.id, i);
        const payment = payments[key];
        if (!payment) {
          adeudado += memberFee;
        } else if (payment.payment_type !== 'pronto_pago_benefit' && payment.amount < memberFee) {
          adeudado += (memberFee - payment.amount);
        }
      }
      result[member.id] = adeudado;
    });
    return result;
  }, [filteredMembers, payments, getPaymentKey, settings.monthly_fee_base]);

  const getExistingPaymentsForMember = useCallback((memberId: string) => {
    const existing = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const year = i < 6 ? currentCalendarYear : nextCalendarYear;
      const month = i < 6 ? i + 7 : i - 5;
      const key = `${memberId}-${month}-${year}`;
      if (payments[key]) existing.add(`${month}-${year}`);
    }
    return existing;
  }, [payments, currentCalendarYear, nextCalendarYear]);

  const getSystemPaymentDate = useCallback(() => getSystemDateString(), []);

  const handleCellClick = useCallback((member: Member, monthIndex: number) => {
    const key = getPaymentKey(member.id, monthIndex);
    const payment = payments[key];
    const { month, year } = getMonthYear(monthIndex);
    setSelectedPayment({ memberId: member.id, memberName: member.full_name, monthIndex, month, year, payment });
    if (payment) {
      setAmount(payment.amount.toString());
      setPaymentDate(payment.paid_at || getSystemPaymentDate());
    } else {
      setAmount(member.treasury_amount?.toString() || settings.monthly_fee_base.toString());
      setPaymentDate(getSystemPaymentDate());
    }
    setReceiptFile(null);
  }, [payments, getPaymentKey, getMonthYear, getSystemPaymentDate, settings.monthly_fee_base]);

  const uploadReceipt = async (file: File, folder: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;
    const { error } = await supabase.storage.from('receipts').upload(filePath, file);
    if (error) throw new Error('Error al subir comprobante');
    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const handleSavePayment = async () => {
    if (!selectedPayment) return;
    setUploading(true);
    try {
      let receiptUrl = selectedPayment.payment?.receipt_url || null;
      if (receiptFile) receiptUrl = await uploadReceipt(receiptFile, 'monthly');

      const paymentData = {
        member_id: selectedPayment.memberId,
        month: selectedPayment.month,
        year: selectedPayment.year,
        amount: parseFloat(amount) || 0,
        paid_at: paymentDate || null,
        receipt_url: receiptUrl,
        payment_type: 'regular' as const,
      };

      const key = `${selectedPayment.memberId}-${selectedPayment.month}-${selectedPayment.year}`;
      const newPayments = { ...payments };
      
      let error;
      if (selectedPayment.payment) {
        newPayments[key] = { ...selectedPayment.payment, ...paymentData };
        setPayments(newPayments);
        const { data: updated, error: updateError } = await supabase
          .from('monthly_payments').update(paymentData).eq('id', selectedPayment.payment.id).select('*').single();
        error = updateError;
        if (updated) upsertCachedMonthlyPayment(updated as any);
      } else {
        const tempId = `temp-${Date.now()}`;
        newPayments[key] = { id: tempId, ...paymentData, quick_pay_group_id: null, created_at: new Date().toISOString() } as Payment;
        setPayments(newPayments);
        const { data, error: insertError } = await supabase
          .from('monthly_payments').insert([paymentData]).select().single();
        error = insertError;
        if (data) { newPayments[key] = data as Payment; setPayments(newPayments); upsertCachedMonthlyPayment(data as any); }
      }

      if (error) throw error;
      toast({ title: 'Pago guardado correctamente' });
      setSelectedPayment(null);
    } catch (error: any) {
      loadData();
      toast({ title: 'Error', description: error.message || 'No se pudo guardar el pago', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const openQuickPay = (member: Member) => {
    setShowQuickPay({ memberId: member.id, memberName: member.full_name, defaultAmount: member.treasury_amount || settings.monthly_fee_base });
    setQuickPayAmount((member.treasury_amount || settings.monthly_fee_base).toString());
    setQuickPayDate(getSystemPaymentDate());
    setQuickPayReceipt(null);
  };

  const openAdvancePayment = (member: Member) => {
    setShowAdvancePayment({ memberId: member.id, memberName: member.full_name, memberMonthlyAmount: member.treasury_amount || settings.monthly_fee_base });
  };

  const handleQuickPay = async () => {
    if (!showQuickPay) return;
    const parsedAmount = parseFloat(quickPayAmount);
    if (!parsedAmount || parsedAmount <= 0) { toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' }); return; }
    if (!quickPayDate) { toast({ title: 'Error', description: 'Debe seleccionar una fecha de pago', variant: 'destructive' }); return; }

    setProcessingQuickPay(true);
    try {
      let receiptUrl: string | null = null;
      if (quickPayReceipt) receiptUrl = await uploadReceipt(quickPayReceipt, 'quick-pay');

      const quickPayGroupId = crypto.randomUUID();
      const paymentsToInsert = [];

      const currentYearPending: Array<{ month: number; year: number; monthIndex: number }> = [];
      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        const { month, year } = getMonthYear(monthIndex);
        const key = `${showQuickPay.memberId}-${month}-${year}`;
        if (!payments[key]) currentYearPending.push({ month, year, monthIndex });
      }

      if (currentYearPending.length === 0) {
        toast({ title: 'Atencion', description: 'Este miembro ya tiene todos los pagos del ano logial actual registrados', variant: 'destructive' });
        setProcessingQuickPay(false);
        return;
      }

      const monthsToPay = currentYearPending.slice(0, Math.min(currentYearPending.length, 11));
      const freeMonth = currentYearPending.length >= 12 ? currentYearPending[11] : null;

      for (const { month, year } of monthsToPay) {
        paymentsToInsert.push({
          member_id: showQuickPay.memberId, month, year,
          amount: parsedAmount, paid_at: quickPayDate, receipt_url: receiptUrl,
          quick_pay_group_id: quickPayGroupId, payment_type: 'pronto_pago',
        });
      }

      if (freeMonth) {
        paymentsToInsert.push({
          member_id: showQuickPay.memberId, month: freeMonth.month, year: freeMonth.year,
          amount: 0, paid_at: quickPayDate, receipt_url: receiptUrl,
          quick_pay_group_id: quickPayGroupId, payment_type: 'pronto_pago_benefit',
        });
      }

      const { data: insertedPayments, error } = await supabase
        .from('monthly_payments').insert(paymentsToInsert).select('*');
      if (error) throw error;
      (insertedPayments || []).forEach((p) => upsertCachedMonthlyPayment(p as any));

      const freeMonthLabel = freeMonth ? `${MONTH_NAMES[freeMonth.month - 1]} ${freeMonth.year}` : '';
      toast({
        title: 'Pronto Pago Registrado',
        description: freeMonth 
          ? `Se pagaron ${monthsToPay.length} meses + ${freeMonthLabel} gratuito para ${showQuickPay.memberName}`
          : `Se pagaron ${monthsToPay.length} meses para ${showQuickPay.memberName}`,
      });

      setShowQuickPay(null);
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo procesar el pronto pago', variant: 'destructive' });
    } finally {
      setProcessingQuickPay(false);
    }
  };

  const handleAdvancePayment = async (data: {
    totalAmount: number; selectedMonths: Array<{ month: number; year: number }>; paymentDate: string; receiptFile: File | null;
  }) => {
    if (!showAdvancePayment) return;
    setProcessingAdvancePayment(true);
    try {
      let receiptUrl: string | null = null;
      if (data.receiptFile) receiptUrl = await uploadReceipt(data.receiptFile, 'advance-pay');

      const advancePayGroupId = crypto.randomUUID();
      const monthlyAmount = showAdvancePayment.memberMonthlyAmount;
      const paymentsToInsert = data.selectedMonths.map(({ month, year }) => ({
        member_id: showAdvancePayment.memberId, month, year, amount: monthlyAmount,
        paid_at: data.paymentDate, receipt_url: receiptUrl,
        quick_pay_group_id: advancePayGroupId, payment_type: 'adelantado' as const,
      }));

      const { data: insertedPayments, error } = await supabase
        .from('monthly_payments').insert(paymentsToInsert).select('*');
      if (error) throw error;
      (insertedPayments || []).forEach((p) => upsertCachedMonthlyPayment(p as any));

      toast({ title: 'Pago por Adelantado Registrado', description: `Se registraron ${paymentsToInsert.length} pagos para ${showAdvancePayment.memberName}` });
      setShowAdvancePayment(null);
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo procesar el pago por adelantado', variant: 'destructive' });
    } finally {
      setProcessingAdvancePayment(false);
    }
  };

  if (loading && members.length === 0) {
    return (
      <div ref={ref} className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Tesoreria</h1>
          <p className="text-muted-foreground mt-1">Control de pagos mensuales - {currentMonthName} {systemYear}</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <span className="text-muted-foreground">Cargando datos...</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Tesoreria</h1>
          <p className="text-muted-foreground mt-1">
            Control de pagos mensuales - Ano Logial {currentCalendarYear}-{nextCalendarYear}
          </p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar miembro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="relative">
          <div className="overflow-x-auto">
            <div className="inline-flex min-w-full">
              {/* Fixed column - Miembro */}
              <div className="sticky left-0 z-30 flex-shrink-0 bg-card border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="min-w-[200px] max-w-[280px] font-semibold text-sm">Miembro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center py-8 text-muted-foreground">
                          {searchTerm ? 'No se encontraron resultados' : 'No hay miembros activos'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMembers.map((member) => (
                        <TableRow key={member.id} className="hover:bg-muted/30 h-[56px]">
                          <TableCell className="min-w-[200px] max-w-[280px] py-2">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{member.full_name}</span>
                              <span className="text-xs text-muted-foreground/70">
                                {GRADE_LABELS[member.degree || ''] || '-'} - ${member.treasury_amount || 50}/mes
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Scrollable columns - Meses + Total Adeudado + Actions */}
              <div className="flex-1">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      {MONTHS.map((month, idx) => (
                        <TableHead key={idx} className="text-center font-semibold min-w-[85px] whitespace-nowrap text-sm py-3">
                          {month}
                        </TableHead>
                      ))}
                      <TableHead className="text-center font-semibold w-[120px] whitespace-nowrap bg-muted/50 text-sm py-3">
                        Total Adeudado
                      </TableHead>
                      <TableHead className="text-center font-semibold w-[180px] whitespace-nowrap text-sm py-3">
                        Acciones
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">&nbsp;</TableCell>
                      </TableRow>
                    ) : (
                      filteredMembers.map((member) => {
                        const memberFee = member.treasury_amount || settings.monthly_fee_base;
                        return (
                          <TableRow key={member.id} className="hover:bg-muted/30 h-[56px]">
                            {MONTHS.map((_, monthIndex) => {
                              const key = getPaymentKey(member.id, monthIndex);
                              const payment = payments[key];
                              const isPaid = !!payment;
                              const isPPBenefit = payment?.payment_type === 'pronto_pago_benefit';
                              const isPartial = isPaid && !isPPBenefit && payment.amount < memberFee;
                              const pendingAmount = isPartial ? (memberFee - payment.amount) : 0;

                              return (
                                <TooltipProvider key={monthIndex}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <TableCell
                                        className={cn(
                                          'text-center relative group cursor-pointer transition-colors min-w-[85px] py-3',
                                          'hover:bg-muted',
                                          isPPBenefit && 'bg-accent/20',
                                          isPartial && 'bg-destructive/15'
                                        )}
                                        onClick={() => handleCellClick(member, monthIndex)}
                                      >
                                        <div className="flex items-center justify-center gap-1">
                                          <span className={cn(
                                            'text-sm',
                                            isPPBenefit ? 'font-bold text-accent' : 
                                            isPartial ? 'font-bold text-destructive' :
                                            isPaid ? 'font-bold' : 'text-muted-foreground'
                                          )}>
                                            {isPPBenefit ? 'P.P' : payment ? `$${payment.amount.toFixed(0)}` : '-'}
                                          </span>
                                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                                        </div>
                                      </TableCell>
                                    </TooltipTrigger>
                                    {isPartial && (
                                      <TooltipContent>
                                        <p className="text-sm">Saldo pendiente para completar cuota: <strong>${pendingAmount.toFixed(2)}</strong></p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                            <TableCell className="text-center bg-background py-3">
                              <span className={cn(
                                'font-bold text-base',
                                totalAdeudado[member.id] > 0 ? 'text-destructive' : 'text-success'
                              )}>
                                ${totalAdeudado[member.id]?.toFixed(0) || 0}
                              </span>
                            </TableCell>
                            <TableCell className="text-center py-3">
                              <div className="flex gap-1 justify-center">
                                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openAdvancePayment(member)}>
                                  <CreditCard className="h-3.5 w-3.5" /> Adelantado
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openQuickPay(member)}>
                                  <Zap className="h-3.5 w-3.5" /> Pronto
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Single Payment Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>
              {selectedPayment?.memberName} - {MONTH_NAMES[(selectedPayment?.month ?? 1) - 1]} {selectedPayment?.year}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Monto *</Label>
              <Input id="amount" type="number" step="0.01" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-lg font-medium" />
              <p className="text-xs text-muted-foreground mt-1">
                Si el monto es menor a la cuota, se registrara como pago parcial
              </p>
            </div>
            <div>
              <Label htmlFor="paymentDate">Fecha de Pago</Label>
              <Input id="paymentDate" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <ReceiptUpload existingUrl={selectedPayment?.payment?.receipt_url} onFileSelect={setReceiptFile} label="Comprobante de Pago" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPayment(null)}>Cancelar</Button>
            <Button onClick={handleSavePayment} disabled={uploading}>{uploading ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Pay Dialog */}
      <Dialog open={!!showQuickPay} onOpenChange={() => setShowQuickPay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Pronto Pago
            </DialogTitle>
            <DialogDescription>
              Registrar pago del Ano Logial completo para {showQuickPay?.memberName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-md text-sm">
              <p className="font-medium">Al confirmar Pronto Pago:</p>
              <ul className="list-disc list-inside mt-1 text-muted-foreground space-y-1">
                <li>Se pagan <span className="font-semibold">11 meses del Ano Logial actual</span></li>
                <li>El <span className="font-semibold text-accent">mes 12 queda marcado como gratuito (P.P)</span></li>
                <li>El mes gratuito no suma a ingresos ni totales</li>
                <li>Todas las cuotas tendran la misma fecha y comprobante</li>
              </ul>
            </div>
            <div>
              <Label htmlFor="quickPayAmount">Monto por mes (11 meses) *</Label>
              <Input id="quickPayAmount" type="number" step="0.01" min="0" value={quickPayAmount}
                onChange={(e) => setQuickPayAmount(e.target.value)} placeholder="0.00" className="text-lg font-medium" />
              <p className="text-xs text-muted-foreground mt-1">
                Total a pagar: ${(parseFloat(quickPayAmount) * 11 || 0).toFixed(2)} (11 meses + 1 mes gratis)
              </p>
            </div>
            <div>
              <Label htmlFor="quickPayDate">Fecha de Pago *</Label>
              <Input id="quickPayDate" type="date" value={quickPayDate} onChange={(e) => setQuickPayDate(e.target.value)} />
            </div>
            <ReceiptUpload onFileSelect={setQuickPayReceipt} label="Comprobante de Pago" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickPay(null)}>Cancelar</Button>
            <Button onClick={handleQuickPay} disabled={processingQuickPay}>
              {processingQuickPay ? 'Procesando...' : 'Confirmar Pronto Pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance Payment Dialog */}
      {showAdvancePayment && (
        <AdvancePaymentDialog
          open={!!showAdvancePayment} onOpenChange={() => setShowAdvancePayment(null)}
          memberName={showAdvancePayment.memberName} memberId={showAdvancePayment.memberId}
          memberMonthlyAmount={showAdvancePayment.memberMonthlyAmount}
          existingPayments={getExistingPaymentsForMember(showAdvancePayment.memberId)}
          currentYear={currentYear} onSubmit={handleAdvancePayment} processing={processingAdvancePayment}
        />
      )}
    </div>
  );
});

export default Treasury;
