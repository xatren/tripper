import { SkeletonBlock } from '@/components/mobile/feedback'
import styles from './Trips.module.css'

/**
 * Screen 04 loading state. Uses the real card geometry (96px rows, 60px thumb)
 * instead of a full-screen spinner, so hydration swaps content in without the
 * list jumping.
 */
export default function TripsLoading() {
  return (
    <main className={styles.page}>
      <div className={styles.topScrim} aria-hidden="true" />
      <div className={styles.bottomScrim} aria-hidden="true" />

      <div className={styles.shell}>
        <div role="status" aria-live="polite">
          <span className={styles.srOnly}>Loading your trips</span>

          <header className={styles.header}>
            <div className={styles.headerTitles}>
              <SkeletonBlock height={11} width={110} radius={6} />
              <SkeletonBlock height={27} width={160} radius={9} style={{ marginTop: 8 }} />
            </div>
            <div className={styles.headerActions}>
              <SkeletonBlock height={44} width={44} radius={14} />
              <SkeletonBlock height={44} width={104} radius={14} />
            </div>
          </header>

          <div className={styles.summary}>
            <SkeletonBlock height={30} width={34} radius={8} />
            <SkeletonBlock height={14} width={92} radius={6} />
          </div>
        </div>

        <div className={styles.library}>
          <div className={styles.filters} aria-hidden="true">
            {[64, 92, 108, 72].map((width) => (
              <SkeletonBlock key={width} height={44} width={width} radius={12} />
            ))}
          </div>

          <div className={styles.list} aria-hidden="true">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className={styles.skeletonCard}>
                <SkeletonBlock height={60} width={60} radius={16} />
                <div className={styles.skeletonLines}>
                  <SkeletonBlock height={17} width="62%" radius={6} />
                  <SkeletonBlock height={13} width="84%" radius={6} />
                  <SkeletonBlock height={12} width="48%" radius={6} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
