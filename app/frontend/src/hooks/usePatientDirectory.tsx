import { type ReactNode, createContext, useContext, useState } from 'react';

interface PatientDirectoryState {
  query: string;
  setQuery: (query: string) => void;
  returnSearch: string;
  setReturnSearch: (search: string) => void;
}

const PatientDirectoryContext = createContext<PatientDirectoryState | null>(null);

export function PatientDirectoryProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [returnSearch, setReturnSearch] = useState('');
  return (
    <PatientDirectoryContext.Provider value={{ query, setQuery, returnSearch, setReturnSearch }}>
      {children}
    </PatientDirectoryContext.Provider>
  );
}

export function usePatientDirectory(): PatientDirectoryState {
  const shared = useContext(PatientDirectoryContext);
  // Standalone route/component tests have no authenticated parent.
  const [query, setQuery] = useState('');
  const [returnSearch, setReturnSearch] = useState('');
  return shared ?? { query, setQuery, returnSearch, setReturnSearch };
}
