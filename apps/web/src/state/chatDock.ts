import { Atom } from "effect/reactivity";

// Whether the chat is docked beside the page. ⌘J toggles it from anywhere, and the sidebar has a
// row that opens it. It stays as it was left across pages.
export const chatDockOpenAtom = Atom.make(false).pipe(Atom.keepAlive);
