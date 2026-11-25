import { Atom } from "effect/reactivity";

// Whether the chat is docked beside the page. ⌘J toggles it from anywhere, and the sidebar has a
// row that opens it. It stays as it was left across pages.
export const chatDockOpenAtom = Atom.make(false).pipe(Atom.keepAlive);

// The dock's own element while it's open, which a page's thread draws itself into.
export const chatDockNodeAtom = Atom.make<HTMLElement | null>(null).pipe(Atom.keepAlive);

// How many thread columns the open page has. While one is mounted the dock holds that page's
// thread, and otherwise the chat on no subject.
export const pageThreadsAtom = Atom.make(0).pipe(Atom.keepAlive);
