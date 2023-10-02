import {createContext, FC, PropsWithChildren, useContext, useEffect, useState} from "react";
import {EncryptionManagerContext} from "./encryption.tsx";
import {Color, Icon} from "../globals.ts";

export interface Account {
    id: string;
    label: string;
    issuer?: string;
    uri: string;
    color: Color;
    icon: Icon;
}

export interface StorageManager {
    ready: boolean,
    accounts: Record<string, Account>;
    saveAccount(account: Account): void;
    clearStorage(): void;
}

export const StorageManagerContext = createContext<StorageManager | null>(null);

export const StorageManagerProvider: FC<PropsWithChildren> = ({children}) => {
    const encryptionManager = useContext(EncryptionManagerContext);

    const [ready, setReady] = useState(false);
    const [accounts, setAccounts] = useState<Record<string, Account>>({});
    useEffect(() => {
        if(encryptionManager?.isLocked) return;

        window.Telegram.WebApp.CloudStorage.getKeys((error, result) => {
            if (error) {
                window.Telegram.WebApp.showAlert(`Failed to get accounts: ${error}`);
                return;
            }
            const accounts = result?.filter(a => a.startsWith("account")) ?? [];
            window.Telegram.WebApp.CloudStorage.getItems(accounts, (error, result) => {
                if (error ?? !result) {
                    window.Telegram.WebApp.showAlert(`Failed to get accounts: ${error}`);
                    return;
                }

                const accounts = Object.values(result)
                    .map(value => encryptionManager?.decrypt(value))
                    .filter((x): x is string => !!x)
                    .map(value => JSON.parse(value) as Account)
                    .reduce((acc: Record<string, Account>, curr) => {
                        acc[curr.id] = curr;
                        return acc;
                    }, {});

                setAccounts(accounts);
                setReady(true);
            });
        });
    }, [encryptionManager, encryptionManager?.isLocked]);

    const storageManager: StorageManager = {
        ready,
        accounts,
        saveAccount(account) {
            const encrypted = encryptionManager?.encrypt(JSON.stringify(account));
            if (!encrypted) return;
            window.Telegram.WebApp.CloudStorage.setItem("account"+account.id, encrypted);
            setAccounts({...accounts, [account.id]: account});
        },
        clearStorage(): void {
            window.Telegram.WebApp.CloudStorage.getKeys((error, result) => {
                if (error ?? !result) return;
                window.Telegram.WebApp.CloudStorage.removeItems(result, (error, result) => {
                    if (!error && result) {
                        setAccounts({});
                        encryptionManager?.removePassword();
                    }
                });
            });
        },
    };

    return <StorageManagerContext.Provider value={storageManager}>
        {children}
    </StorageManagerContext.Provider>
};