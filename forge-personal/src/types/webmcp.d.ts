export {};
declare global {
  interface Document { modelContext?: import('@forge/core').ModelContext; }
  interface Navigator { modelContext?: import('@forge/core').ModelContext; }
}
