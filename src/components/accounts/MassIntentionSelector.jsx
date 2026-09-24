import React, { useMemo, useState } from 'react';
import { BookOpen, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const typeLabel = type => ({
  difunto: 'Difunto',
  gracias: 'Acción de Gracias',
  salud: 'Salud',
  otra: 'Otra intención',
}[type] || 'Intención');

const MassIntentionSelector = ({
  intentions = [],
  value,
  onChange,
  disabled = false,
  placeholder = 'Vincular intención de Misa...',
  excludeCollected = false,
  excludeReceivable = false,
  excludePayable = false,
}) => {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => {
    return [...(intentions || [])]
      .filter(item => {
        const current = String(item?.id || '') === String(value || '');
        if (current) return true;
        if (excludeCollected && item?.transactionId) return false;
        if (excludeReceivable && item?.receivableId) return false;
        if (excludePayable && item?.payableId) return false;
        return true;
      })
      .sort((a, b) => {
        const d = String(b?.date || '').localeCompare(String(a?.date || ''));
        if (d !== 0) return d;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });
  }, [intentions, value, excludeCollected, excludeReceivable, excludePayable]);

  const selected = (intentions || []).find(item => String(item.id) === String(value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-11 w-full justify-between rounded-xl border-slate-200 bg-white text-left font-normal"
        >
          {selected ? (
            <span className="min-w-0 truncate font-medium text-slate-800">
              {selected.name} · {selected.date}
            </span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[9999] w-[min(420px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar intención, contacto o fecha..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No se encontraron intenciones.</CommandEmpty>
            <CommandGroup heading="Intenciones de Misa">
              <CommandItem
                value="sin vínculo"
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                <span className="text-slate-500">Sin intención vinculada</span>
              </CommandItem>
              {sorted.map(item => (
                <CommandItem
                  key={item.id}
                  value={[item.name, item.offeredBy, item.contact, item.date, typeLabel(item.type)].filter(Boolean).join(' ')}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0 text-blue-600', String(value) === String(item.id) ? 'opacity-100' : 'opacity-0')} />
                  <BookOpen className="mr-2 h-4 w-4 shrink-0 text-[#8b6f4e]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name || 'Sin nombre'}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {item.date || 'Sin fecha'} · {typeLabel(item.type)}
                      {item.contact ? ` · ${item.contact}` : ''}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MassIntentionSelector;
