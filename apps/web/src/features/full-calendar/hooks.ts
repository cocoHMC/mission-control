import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export function useDisclosure({
	defaultIsOpen = false,
}: {
	defaultIsOpen?: boolean;
} = {}) {
	const [isOpen, setIsOpen] = useState(defaultIsOpen);

	const onOpen = () => setIsOpen(true);
	const onClose = () => setIsOpen(false);
	const onToggle = () => setIsOpen((currentValue) => !currentValue);

	return { onOpen, onClose, isOpen, onToggle };
}

export const useLocalStorage = <T>(
	key: string,
	initialValue: T,
): [T, (value: T) => void] => {
	// IMPORTANT: don't read localStorage during initial render; it causes SSR hydration
	// mismatches in Next.js because the server can't see the client value. We sync from
	// localStorage after mount instead.
	const initialValueRef = useRef(initialValue);
	useEffect(() => {
		initialValueRef.current = initialValue;
	}, [initialValue]);

	const [storedValue, setStoredValue] = useState<T>(initialValue);

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const item = window.localStorage.getItem(key);
			setStoredValue(item ? (JSON.parse(item) as T) : initialValueRef.current);
		} catch (error) {
			console.warn(`Error reading localStorage key "${key}":`, error);
			setStoredValue(initialValueRef.current);
		}
	}, [key]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const onStorage = (event: StorageEvent) => {
			if (event.key !== key) return;
			try {
				setStoredValue(
					event.newValue
						? (JSON.parse(event.newValue) as T)
						: initialValueRef.current,
				);
			} catch (error) {
				console.warn(`Error reading localStorage key "${key}":`, error);
				setStoredValue(initialValueRef.current);
			}
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [key]);

	const setValue = (value: T) => {
		try {
			const valueToStore =
				value instanceof Function ? value(storedValue) : value;
			setStoredValue(valueToStore);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(key, JSON.stringify(valueToStore));
			}
		} catch (error) {
			console.warn(`Error setting localStorage key "${key}":`, error);
		}
	};

	return [storedValue, setValue];
};

export function useMediaQuery(query: string): boolean {
	return useSyncExternalStore(
		(onStoreChange) => {
			if (typeof window === "undefined") return () => {};
			const media = window.matchMedia(query);
			const listener = () => onStoreChange();
			media.addEventListener("change", listener);
			return () => media.removeEventListener("change", listener);
		},
		() =>
			typeof window === "undefined" ? false : window.matchMedia(query).matches,
		() => false,
	);
}
