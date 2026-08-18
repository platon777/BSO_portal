import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SearchIcon, ChevronDownIcon, CheckIcon, UserIcon } from '../icons/Icons';

export interface AgentOption {
  id: string;
  name: string;
  email?: string;
  role?: number | string;
}

interface AgentSearchSelectProps {
  agents: AgentOption[];
  selectedAgentId: string;
  onSelect: (agentId: string) => void;
  isLoading?: boolean;
  currentUserId?: string;
}

const getRoleBadge = (role?: number | string) => {
  const r = String(role || '').toLowerCase();
  if (r === '1' || r === 'admin') return <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 rounded">Admin</span>;
  if (r === '2' || r === 'manager' || r === 'managers') return <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 rounded">Manager</span>;
  if (r === '5' || r === 'finance') return <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded">Finance</span>;
  return <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-800 rounded">Agent</span>;
};

const AgentSearchSelect: React.FC<AgentSearchSelectProps> = ({
  agents,
  selectedAgentId,
  onSelect,
  isLoading = false,
  currentUserId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId);
  }, [agents, selectedAgentId]);

  const filteredAgents = useMemo(() => {
    if (!searchTerm.trim()) return agents;
    const q = searchTerm.toLowerCase().trim();
    return agents.filter((a) => {
      const nameMatch = a.name.toLowerCase().includes(q);
      const emailMatch = a.email ? a.email.toLowerCase().includes(q) : false;
      const idMatch = a.id.toLowerCase().includes(q);
      return nameMatch || emailMatch || idMatch;
    });
  }, [agents, searchTerm]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onSelect(id);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative w-full sm:w-auto" ref={wrapperRef}>
      {/* Bouton déclencheur */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isLoading}
        className="w-full sm:min-w-[280px] flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-left min-h-[44px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
            {selectedAgent ? selectedAgent.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {selectedAgent ? selectedAgent.name : 'Sélectionner un agent'}
              {selectedAgent && currentUserId === selectedAgent.id && ' (Moi)'}
            </div>
            {selectedAgent?.email && (
              <div className="text-xs text-gray-500 truncate">{selectedAgent.email}</div>
            )}
          </div>
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover / Menu déroulant */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-full sm:w-[320px] max-w-[95vw] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Champ de recherche */}
          <div className="p-2.5 border-b border-gray-100 bg-gray-50/50">
            <div className="relative">
              <SearchIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher nom, email..."
                className="w-full pl-8 pr-3 py-1.5 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Liste des agents */}
          <div className="max-h-[260px] overflow-y-auto divide-y divide-gray-50 p-1">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-gray-500">Chargement des agents...</div>
            ) : filteredAgents.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">Aucun agent trouvé</div>
            ) : (
              filteredAgents.map((agent) => {
                const isSelected = agent.id === selectedAgentId;
                const isSelf = currentUserId === agent.id;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => handleSelect(agent.id)}
                    className={`w-full flex items-center justify-between gap-2 p-2 rounded-lg text-left transition-colors min-h-[44px] ${
                      isSelected ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-medium flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{agent.name}</span>
                          {isSelf && <span className="text-[10px] text-blue-600 font-bold">(Moi)</span>}
                          {getRoleBadge(agent.role)}
                        </div>
                        {agent.email && (
                          <div className="text-[11px] text-gray-400 truncate">{agent.email}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && <CheckIcon className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer compteur */}
          <div className="p-2 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-500 flex justify-between items-center">
            <span>{filteredAgents.length} agent(s) disponible(s)</span>
            {currentUserId && selectedAgentId !== currentUserId && (
              <button
                type="button"
                onClick={() => handleSelect(currentUserId)}
                className="text-blue-600 hover:text-blue-800 font-semibold"
              >
                Revenir à moi
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSearchSelect;
