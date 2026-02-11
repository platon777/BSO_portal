import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface AsyncSearchableOption {
  id: string;
  label: string;
  subLabel?: string;
}

export interface LoadOptionsParams {
  search: string;
  offset: number;
  limit: number;
}

export interface LoadOptionsResult {
  options: AsyncSearchableOption[];
  hasMore: boolean;
}

interface AsyncSearchableSelectProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  loadOptions: (params: LoadOptionsParams) => Promise<LoadOptionsResult>;
  resolveValue?: (value: string) => Promise<AsyncSearchableOption | null>;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  pageSize?: number;
  emptyText?: string;
}

const mergeUniqueOptions = (current: AsyncSearchableOption[], incoming: AsyncSearchableOption[]) => {
  const map = new Map<string, AsyncSearchableOption>();
  current.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
};

const AsyncSearchableSelect: React.FC<AsyncSearchableSelectProps> = ({
  label,
  value,
  onChange,
  loadOptions,
  resolveValue,
  placeholder = 'Rechercher...',
  disabled = false,
  required = false,
  pageSize = 20,
  emptyText = 'Aucun resultat',
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const lastResolvedValueRef = useRef<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<AsyncSearchableOption[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const selectedOption = useMemo(() => options.find((opt) => opt.id === value), [options, value]);

  const fetchOptions = async (reset: boolean) => {
    const requestId = ++requestIdRef.current;
    const nextOffset = reset ? 0 : offset;
    setIsLoading(true);

    try {
      const result = await loadOptions({
        search: searchTerm.trim(),
        offset: nextOffset,
        limit: pageSize,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setOptions((prev) => (reset ? result.options : mergeUniqueOptions(prev, result.options)));
      setOffset(nextOffset + result.options.length);
      setHasMore(result.hasMore);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen || disabled) return;

    const timer = window.setTimeout(() => {
      void fetchOptions(true);
    }, 220);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, isOpen, disabled, pageSize, loadOptions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  useEffect(() => {
    if (!value) {
      lastResolvedValueRef.current = null;
      if (!isOpen) {
        setSearchTerm('');
      }
      return;
    }

    if (selectedOption) {
      if (!isOpen) {
        setSearchTerm(selectedOption.label);
      }
      lastResolvedValueRef.current = value;
      return;
    }

    if (!resolveValue || lastResolvedValueRef.current === value) {
      return;
    }

    lastResolvedValueRef.current = value;
    void resolveValue(value).then((resolved) => {
      if (!resolved) return;
      setOptions((prev) => mergeUniqueOptions(prev, [resolved]));
      if (!isOpen) {
        setSearchTerm(resolved.label);
      }
    });
  }, [value, selectedOption, resolveValue, isOpen]);

  const handleSelect = (option: AsyncSearchableOption) => {
    onChange(option.id);
    setSearchTerm(option.label);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setSearchTerm(nextValue);
    if (!isOpen) {
      setIsOpen(true);
    }
    if (!nextValue.trim()) {
      onChange(null);
    }
  };

  const toggleOpen = () => {
    if (disabled) return;
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && options.length === 0) {
      void fetchOptions(true);
    }
  };

  const handleLoadMore = () => {
    if (isLoading || !hasMore) return;
    void fetchOptions(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <div className="flex gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 w-full px-3 py-3 sm:py-2 text-base sm:text-sm text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 min-h-[44px]"
        />
        <button
          type="button"
          onClick={toggleOpen}
          disabled={disabled}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-60 min-h-[44px]"
        >
          {isOpen ? 'Fermer' : 'Ouvrir'}
        </button>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          <ul className="max-h-60 overflow-auto overscroll-contain">
            {options.length > 0 ? (
              options.map((option) => (
                <li
                  key={option.id}
                  onClick={() => handleSelect(option)}
                  className="px-3 py-3 sm:py-2 cursor-pointer hover:bg-gray-100 min-h-[44px]"
                >
                  <div className="font-medium text-gray-800">{option.label}</div>
                  {option.subLabel && <div className="text-xs text-gray-500">{option.subLabel}</div>}
                </li>
              ))
            ) : (
              <li className="px-3 py-3 text-gray-500 text-sm">{isLoading ? 'Chargement...' : emptyText}</li>
            )}
          </ul>

          <div className="border-t border-gray-200 p-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800"
            >
              Fermer
            </button>
            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoading}
                className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                {isLoading ? 'Chargement...' : 'Charger plus'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AsyncSearchableSelect;
