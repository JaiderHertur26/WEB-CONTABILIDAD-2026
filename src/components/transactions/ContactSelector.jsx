import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const ContactSelector = ({ contacts, value, onChange, placeholder = "Seleccionar contacto...", disabled = false }) => {
    const [open, setOpen] = useState(false);

    const sortedContacts = useMemo(() => {
        if (!contacts || !Array.isArray(contacts)) return [];
        return [...contacts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [contacts]);

    const selectedContact = contacts?.find(c => c.id === value);

    const getBadgeColor = (cat) => {
        switch(cat) {
            case 'Cliente': return 'bg-blue-100 text-blue-800';
            case 'Proveedor': return 'bg-green-100 text-green-800';
            case 'Acreedor': return 'bg-orange-100 text-orange-800';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className="w-full justify-between bg-white text-left font-normal border-slate-300"
                >
                    {selectedContact ? (
                        <div className="flex items-center gap-2 truncate">
                            <span className="font-medium text-slate-900">{selectedContact.name}</span>
                            <Badge variant="outline" className={`text-[10px] px-1 h-5 ${getBadgeColor(selectedContact.category)}`}>
                                {selectedContact.category || 'Cliente'}
                            </Badge>
                        </div>
                    ) : (
                        <span className="text-slate-500">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-[9999]" align="start">
                <Command>
                    <CommandInput placeholder="Buscar contacto..." />
                    <CommandList>
                        <CommandEmpty>No se encontraron contactos.</CommandEmpty>
                        <CommandGroup heading="Todos los Contactos">
                            {sortedContacts.map(c => (
                                <CommandItem
                                    key={c.id}
                                    value={c.name}
                                    onSelect={() => {
                                        onChange(c.id === value ? "" : c.id);
                                        setOpen(false);
                                    }}
                                    className="cursor-pointer"
                                >
                                    <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col w-full">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-slate-900">{c.name}</span>
                                            <Badge variant="outline" className={`text-[10px] px-1 ${getBadgeColor(c.category)}`}>
                                                {c.category || 'Cliente'}
                                            </Badge>
                                        </div>
                                        <span className="text-xs text-slate-500">{c.docType} {c.docNumber}</span>
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

export default ContactSelector;