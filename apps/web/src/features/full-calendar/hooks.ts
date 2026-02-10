import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

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

	// `useSyncExternalStore` requires that `getSnapshot()` returns the *same*
	// value (by `Object.is`) if the underlying store hasn't changed. Parsing
	// JSON on every call creates a fresh object each time and can cause
	// infinite re-render loops ("Maximum update depth exceeded").
	const snapshotCacheRef = useRef<{ raw: string | null; value: T } | null>(
		null,
	);

	const getSnapshot = useCallback((): T => {
		if (typeof window === "undefined") return initialValueRef.current;
		let raw: string | null = null;
		try {
			raw = window.localStorage.getItem(key);
			const cached = snapshotCacheRef.current;
			if (cached && cached.raw === raw) return cached.value;

			let value: T;
			if (!raw) {
				value = initialValueRef.current;
			} else {
				try {
					value = JSON.parse(raw) as T;
				} catch (error) {
					console.warn(`Error parsing localStorage key "${key}":`, error);
					value = initialValueRef.current;
				}
			}

			snapshotCacheRef.current = { raw, value };
			return value;
		} catch (error) {
			console.warn(`Error reading localStorage key "${key}":`, error);
			// Cache the fallback too so we don't oscillate.
			snapshotCacheRef.current = { raw, value: initialValueRef.current };
			return initialValueRef.current;
		}
	}, [key]);

	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			if (typeof window === "undefined") return () => {};

			const onStorage = (event: StorageEvent) => {
				if (event.key !== key) return;
				onStoreChange();
			};

			// `storage` events do not fire in the same document that performed the write,
			// so we dispatch a custom event to notify same-tab subscribers.
			const onLocalStorage = (event: Event) => {
				const customEvent = event as CustomEvent<{ key?: string }>;
				if (customEvent.detail?.key !== key) return;
				onStoreChange();
			};

			window.addEventListener("storage", onStorage);
			window.addEventListener("local-storage", onLocalStorage);

			return () => {
				window.removeEventListener("storage", onStorage);
				window.removeEventListener("local-storage", onLocalStorage);
			};
		},
		[key],
	);

	const storedValue = useSyncExternalStore(
		subscribe,
		getSnapshot,
		() => initialValueRef.current,
	);

	const setValue = (value: T) => {
		try {
			const valueToStore =
				value instanceof Function ? value(storedValue) : value;
			if (typeof window !== "undefined") {
				window.localStorage.setItem(key, JSON.stringify(valueToStore));
				window.dispatchEvent(
					new CustomEvent("local-storage", { detail: { key } }),
				);
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
