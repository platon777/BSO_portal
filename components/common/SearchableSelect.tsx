import React, { useState, useMemo, useRef, useEffect } from 'react';

// FIX: A new reusable component for a searchable select/dropdown was created to improve UX when selecting a client from a potentially long list.

interface Option {
  id: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = "Rechercher...",
  disabled = false,
  required = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => options.find(opt => opt.id === value), [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) {
      return options;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return options.filter(opt =>
      opt.label.toLowerCase().includes(lowercasedFilter) ||
      (opt.subLabel && opt.subLabel.toLowerCase().includes(lowercasedFilter))
    );
  }, [searchTerm, options]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const handleSelect = (option: Option) => {
    onChange(option.id);
    setSearchTerm(option.label);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (!isOpen) setIsOpen(true);
    if (e.target.value === '') {
      onChange(null);
    }
  }

  // Track previous value to only update searchTerm when value prop changes
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      if (selectedOption) {
        setSearchTerm(selectedOption.label);
      } else {
        setSearchTerm('');
      }
      prevValueRef.current = value;
    } else if (selectedOption && searchTerm === '') {
      // Edge case: if options loaded late and we have a value but no search term yet
      setSearchTerm(selectedOption.label);
    }
  }, [value, selectedOption, searchTerm]);


  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
      />
      {isOpen && !disabled && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(option => (
              <li
                key={option.id}
                onClick={() => handleSelect(option)}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100"
              >
                <div className="font-medium text-gray-800">{option.label}</div>
                {option.subLabel && <div className="text-xs text-gray-500">{option.subLabel}</div>}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-gray-500">Aucun résultat</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;
