
import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  totalItems: number;
  onItemsPerPageChange: (value: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ 
    currentPage, 
    totalPages, 
    onPageChange,
    itemsPerPage,
    totalItems,
    onItemsPerPageChange,
}) => {
  if (totalPages <= 1) return null;

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="px-4 py-3 mt-4 text-sm text-gray-600">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between sm:justify-start gap-2">
                <select
                    value={itemsPerPage}
                    onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                    className="p-2 border rounded-lg text-sm min-h-[36px]"
                >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                </select>
                <span>{startItem}-{endItem} sur {totalItems}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
                <button
                    onClick={handlePrevious}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border rounded-lg disabled:opacity-50 min-h-[44px] min-w-[44px] text-sm font-medium"
                >
                    &larr;
                </button>
                <span className="text-sm text-gray-700 font-medium px-2">
                    {currentPage} / {totalPages}
                </span>
                <button
                    onClick={handleNext}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border rounded-lg disabled:opacity-50 min-h-[44px] min-w-[44px] text-sm font-medium"
                >
                    &rarr;
                </button>
            </div>
        </div>
    </div>
  );
};

export default Pagination;
