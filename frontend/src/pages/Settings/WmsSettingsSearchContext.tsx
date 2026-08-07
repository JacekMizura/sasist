import { createContext, useContext } from "react";

export type WmsSettingsSearchContextValue = {
  query: string;
};

export const WmsSettingsSearchContext = createContext<WmsSettingsSearchContextValue>({ query: "" });

export function useWmsSettingsSearch(): WmsSettingsSearchContextValue {
  return useContext(WmsSettingsSearchContext);
}
