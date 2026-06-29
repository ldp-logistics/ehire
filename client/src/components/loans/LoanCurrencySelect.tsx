import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOAN_CURRENCIES, type LoanCurrency } from "@shared/loanCurrency";

interface LoanCurrencySelectProps {
  value: LoanCurrency;
  onChange: (currency: LoanCurrency) => void;
  label?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}

export function LoanCurrencySelect({
  value,
  onChange,
  label = "Currency",
  required = false,
  className,
  disabled = false,
}: LoanCurrencySelectProps) {
  return (
    <div className={className}>
      <Label>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as LoanCurrency)} disabled={disabled}>
        <SelectTrigger className="mt-1.5">
          <SelectValue placeholder="Select currency" />
        </SelectTrigger>
        <SelectContent>
          {LOAN_CURRENCIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
