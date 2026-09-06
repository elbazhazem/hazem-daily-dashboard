export function shouldAutosaveDailyNote(loadedNoteDate: string | null, selectedDate: string) {
  return loadedNoteDate === selectedDate;
}
