import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { UserRole } from '../../types/auth';
import { toast } from 'react-hot-toast';
import { accessService } from '../../services/accessService';

interface AccessGrantModalProps {
    clientId: string;
    clientName: string;
    transactionId?: string; // Optional transaction ID
    onClose: () => void;
}

const AccessGrantModal: React.FC<AccessGrantModalProps> = ({ clientId, clientName, transactionId, onClose }) => {
    const [agents, setAgents] = useState<any[]>([]);
    const [selectedAgent, setSelectedAgent] = useState('');
    const [duration, setDuration] = useState(60); // minutes
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        const fetchAgents = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('user_id, firstname, name')
                .eq('role', UserRole.AGENT)
                .order('firstname', { ascending: true });
            if (data) setAgents(data);
        };
        fetchAgents();
    }, []);

    const filteredAgents = useMemo(() => {
        if (!searchTerm) return agents;
        const lowerSearch = searchTerm.toLowerCase();
        return agents.filter(agent =>
            `${agent.firstname} ${agent.name}`.toLowerCase().includes(lowerSearch)
        );
    }, [agents, searchTerm]);

    const selectedAgentName = useMemo(() => {
        const agent = agents.find(a => a.user_id === selectedAgent);
        return agent ? `${agent.firstname} ${agent.name}` : '';
    }, [selectedAgent, agents]);

    const handleGrant = async () => {
        if (!selectedAgent) return;
        setLoading(true);
        const { error } = await accessService.grantAccess(selectedAgent, clientId, duration, transactionId);
        setLoading(false);

        if (error) {
            toast.error('Erreur: ' + error);
        } else {
            const accessType = transactionId ? 'à la transaction' : 'au client';
            toast.success(`Accès accordé ${accessType} pour ${clientName} pendant ${duration} minutes`);
            onClose();
        }
    };

    const handleSelectAgent = (agentId: string) => {
        setSelectedAgent(agentId);
        setIsDropdownOpen(false);
        setSearchTerm('');
    };

    return (
        <div className="p-4">
            <h3 className="text-lg font-bold mb-4">Accorder l'accès temporaire</h3>
            <p className="mb-2">Client: <strong>{clientName}</strong></p>
            {transactionId && (
                <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    ⚠️ Vous accordez l'accès uniquement à une transaction spécifique.
                </div>
            )}

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
                <div className="relative">
                    <div
                        className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 bg-white cursor-pointer"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                        <div className="px-3 py-2 flex items-center justify-between">
                            <span className={selectedAgent ? 'text-gray-900' : 'text-gray-400'}>
                                {selectedAgentName || 'Sélectionner un agent'}
                            </span>
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    {isDropdownOpen && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
                            <div className="p-2 border-b border-gray-200">
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Rechercher un agent..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {filteredAgents.length > 0 ? (
                                    filteredAgents.map(agent => (
                                        <div
                                            key={agent.user_id}
                                            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${selectedAgent === agent.user_id ? 'bg-blue-100' : ''
                                                }`}
                                            onClick={() => handleSelectAgent(agent.user_id)}
                                        >
                                            {agent.firstname} {agent.name}
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-3 py-2 text-gray-500 text-center">
                                        Aucun agent trouvé
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Durée (minutes)</label>
                <input
                    type="number"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    min="1"
                />
            </div>

            <div className="flex justify-end space-x-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                    Annuler
                </button>
                <button
                    onClick={handleGrant}
                    disabled={loading || !selectedAgent}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Traitement...' : 'Accorder'}
                </button>
            </div>
        </div>
    );
};

export default AccessGrantModal;
