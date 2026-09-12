/**
 * Runs a task with its button disabled and relabelled, so a slow request cannot
 * be sent twice, and puts the button back however the task ends.
 */
export async function whileBusy<T>(button: HTMLButtonElement, label: string, task: () => Promise<T>): Promise<T> {
  const original = button.textContent ?? '';
  button.disabled = true;
  button.textContent = label;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
