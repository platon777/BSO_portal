
import React, { useEffect, useMemo, useRef, useState } from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: string;
  children: React.ReactNode;
}

interface SelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

const getOptionText = (children: React.ReactNode): string => {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(getOptionText).join('');
  }
  return '';
};

const Select: React.FC<SelectProps> = ({
  label,
  name,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  className = '',
  id,
  ...rest
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectId = id || name;
  const requiredLabel = required && !label.includes('*');

  const options = useMemo<SelectOption[]>(() => {
    return React.Children.toArray(children)
      .filter(React.isValidElement)
      .map((child) => {
        const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
        const optionValue = props.value === undefined ? getOptionText(props.children) : String(props.value);
        return {
          value: optionValue,
          label: getOptionText(props.children),
          disabled: Boolean(props.disabled),
        };
      });
  }, [children]);

  const currentValue = value === undefined ? String(defaultValue ?? '') : String(value ?? '');
  const selectedOption = useMemo(
    () => options.find((option) => option.value === currentValue),
    [options, currentValue]
  );

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(normalizedSearch) ||
      option.value.toLowerCase().includes(normalizedSearch)
    );
  }, [options, searchTerm]);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm(selectedOption?.label || '');
    }
  }, [isOpen, selectedOption]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const emitChange = (nextValue: string) => {
    if (!onChange) return;
    const syntheticEvent = {
      target: { name, value: nextValue },
      currentTarget: { name, value: nextValue },
    } as React.ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
  };

  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return;
    emitChange(option.value);
    setSearchTerm(option.label);
    setIsOpen(false);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setSearchTerm(nextValue);
    setIsOpen(true);
    if (!nextValue.trim() && currentValue) {
      emitChange('');
    }
  };

  const openDropdown = () => {
    if (disabled) return;
    setSearchTerm('');
    setIsOpen(true);
    window.setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1">
        {label} {requiredLabel && <span className="text-red-500">*</span>}
      </label>

      <input
        ref={inputRef}
        id={selectId}
        type="text"
        value={isOpen ? searchTerm : selectedOption?.label || ''}
        onChange={handleInputChange}
        onFocus={openDropdown}
        onClick={openDropdown}
        placeholder={selectedOption?.label || 'Rechercher...'}
        disabled={disabled}
        required={required}
        className="w-full px-3 py-3 sm:py-2 pr-10 text-base sm:text-sm text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 min-h-[44px]"
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`${selectId}-options`}
        aria-required={required}
      />

      <button
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        disabled={disabled}
        className="absolute right-2 top-[31px] sm:top-[29px] h-8 w-8 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50"
        aria-label={isOpen ? 'Fermer la liste' : 'Ouvrir la liste'}
      >
        <span className={`block transition-transform ${isOpen ? 'rotate-180' : ''}`}>v</span>
      </button>

      <select
        id={`${selectId}-native`}
        name={name}
        value={currentValue}
        onChange={onChange}
        disabled={disabled}
        required={false}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        {...rest}
      >
        {children}
      </select>

      {isOpen && !disabled && (
        <div
          id={`${selectId}-options`}
          className="absolute z-30 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden"
        >
          <ul className="max-h-[45vh] sm:max-h-64 overflow-auto overscroll-contain py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <li key={`${option.value}-${option.label}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(option)}
                    disabled={option.disabled}
                    className={`w-full px-3 py-3 sm:py-2 text-left text-sm min-h-[44px] ${
                      option.value === currentValue ? 'bg-blue-50 text-blue-800 font-medium' : 'text-gray-800 hover:bg-gray-100'
                    } disabled:text-gray-400 disabled:cursor-not-allowed`}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-3 text-sm text-gray-500">Aucun resultat</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Select;
