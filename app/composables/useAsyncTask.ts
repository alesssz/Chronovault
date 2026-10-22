/**
 * The pattern behind every button that calls the API: a `running` flag for
 * its spinner, and failures reported in an error toast instead of thrown.
 *
 *   const saving = useAsyncTask()
 *   await saving.run(async () => { … }, 'Save failed')
 *   <UButton :loading="saving.running" />
 *
 * One instance per action, so each button spins on its own. The result is
 * reactive (`saving.running` is a plain boolean, in scripts and templates
 * alike): keep it whole, destructuring would lose the reactivity.
 */
export function useAsyncTask() {
  // Failure messages.
  const toast = useToast()
  /** The task is running (spinners, locked dialogs). */
  const running = ref(false)

  /**
   * Runs `task`; on failure shows `failureTitle` with the server's (or the
   * browser's) message. Resolves to true when the task succeeded.
   */
  async function run(task: () => Promise<void>, failureTitle: string): Promise<boolean> {
    running.value = true
    try {
      await task()
      return true
    }
    catch (err) {
      toast.add({ title: failureTitle, description: getErrorMessage(err), color: 'error' })
      return false
    }
    finally {
      running.value = false
    }
  }

  return reactive({ running, run })
}
