
import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: string;
  children: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({ label, name, children, ...rest }) => {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <select
        id={name}
        name={name}
        className="w-full px-3 py-3 sm:py-2 text-base sm:text-sm text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
        {...rest}
      >
        {children}
      </select>
    </div>
  );
};

export default Select;
