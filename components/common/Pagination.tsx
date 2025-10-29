
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
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
        <div>
            <select
                value={itemsPerPage}
                onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                className="p-1 border rounded-md"
            >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
            </select>
            <span className="ml-2">
                {startItem}-{endItem} sur {totalItems}
            </span>
        </div>
        <div className="flex items-center space-x-2">
            <button
                onClick={handlePrevious}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded-md disabled:opacity-50"
            >
                Précédent
            </button>
            <span>
                Page {currentPage} sur {totalPages}
            </span>
            <button
                onClick={handleNext}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded-md disabled:opacity-50"
            >
                Suivant
            </button>
        </div>
    </div>
  );
};

export default Pagination;
