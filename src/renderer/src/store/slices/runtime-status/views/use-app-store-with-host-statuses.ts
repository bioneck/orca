import { useRef, useSyncExternalStore } from 'react'
import { useAppStore } from '../../../index'
import type { AppState } from '../../../types'
import {
  useAppStateView,
  useAppStateViewActive,
  type AppStateView
} from '../../../retained-views/app-state-view'
import { readRuntimeStatusesForView, type RuntimeStatuses } from './runtime-status-owner'
import { runtimeStatusSubscriptionsFor } from './runtime-status-subscriptions'

type HostStatusesSelector<T> = (state: AppState, statuses: RuntimeStatuses) => T
type Selection<T> = {
  state: AppState
  statuses: RuntimeStatuses
  selector: HostStatusesSelector<T>
  value: T
}

const subscribeNothing = (): (() => void) => () => {}
const liveAppStore = (): AppStateView => useAppStore

function useViewWithHostStatuses<T>(
  view: AppStateView,
  live: boolean,
  selector: HostStatusesSelector<T>,
  equality: (a: T, b: T) => boolean
): T {
  // One joined wake per publication from the owner, so a host write never notifies a reader twice.
  const subscribe = live ? runtimeStatusSubscriptionsFor(view).subscribeStore : subscribeNothing
  // Why one record updated in place: a store write must not allocate per mounted reader.
  const selection = useRef<Selection<T> | null>(null)
  const getSnapshot = (): T => {
    const state = view.getState()
    const statuses = readRuntimeStatusesForView(view)
    const cached = selection.current
    if (!cached) {
      const value = selector(state, statuses)
      selection.current = { state, statuses, selector, value }
      return value
    }
    if (cached.state === state && cached.statuses === statuses && cached.selector === selector) {
      return cached.value
    }
    const next = selector(state, statuses)
    cached.state = state
    cached.statuses = statuses
    cached.selector = selector
    if (!equality(cached.value, next)) {
      cached.value = next
    }
    return cached.value
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** useAppStore for a selector that also reads host statuses, which come from the host status owner. */
export function useAppStoreWithHostStatuses<T>(
  selector: HostStatusesSelector<T>,
  equality: (a: T, b: T) => boolean = Object.is
): T {
  return useViewWithHostStatuses(liveAppStore(), true, selector, equality)
}

/** useAppStateValue for that selector: a retained view reads the statuses frozen with it. */
export function useAppStateValueWithHostStatuses<T>(
  selector: HostStatusesSelector<T>,
  equality: (a: T, b: T) => boolean = Object.is
): T {
  const view = useAppStateView()
  const live = useAppStateViewActive()
  return useViewWithHostStatuses(view, live, selector, equality)
}
