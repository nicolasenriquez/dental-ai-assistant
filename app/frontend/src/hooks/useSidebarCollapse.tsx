import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useState,
} from 'react';

interface SidebarCollapseState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
}

const SidebarCollapseContext = createContext<SidebarCollapseState | null>(null);

export function SidebarCollapseProvider({ children }: { children: ReactNode }): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <SidebarCollapseContext.Provider value={{ sidebarCollapsed, setSidebarCollapsed }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse(): SidebarCollapseState {
  const shared = useContext(SidebarCollapseContext);
  // ponytail: isolated shell tests retain local state without the authenticated parent.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return shared ?? { sidebarCollapsed, setSidebarCollapsed };
}
