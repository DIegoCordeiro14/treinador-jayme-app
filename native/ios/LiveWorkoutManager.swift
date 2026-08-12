import Foundation
import HealthKit

/**
 * FC ao vivo no Apple Watch: HKWorkoutSession + HKLiveWorkoutBuilder.
 * Encaminha para o iPhone via WatchConnectivity; o plugin emite "liveMetrics".
 */
class LiveWorkoutManager: NSObject, HKLiveWorkoutBuilderDelegate {
  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private let emit: ([String: Any]) -> Void

  init(emit: @escaping ([String: Any]) -> Void) { self.emit = emit }

  func start(sportType: String?) {
    let config = HKWorkoutConfiguration()
    config.activityType = .traditionalStrengthTraining
    do {
      session = try HKWorkoutSession(healthStore: store, configuration: config)
      builder = session?.associatedWorkoutBuilder()
      builder?.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
      builder?.delegate = self
      session?.startActivity(with: Date())
      builder?.beginCollection(withStart: Date()) { _, _ in }
    } catch { /* falha ao iniciar sessão */ }
  }

  func stop() {
    session?.end()
    builder?.endCollection(withEnd: Date()) { _, _ in self.builder?.finishWorkout { _, _ in } }
  }

  func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
    guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return }
    if collectedTypes.contains(hrType), let stats = workoutBuilder.statistics(for: hrType) {
      let unit = HKUnit.count().unitDivided(by: .minute())
      let bpm = stats.mostRecentQuantity()?.doubleValue(for: unit)
      var e: [String: Any] = ["timestamp": ISO8601DateFormatter().string(from: Date()), "source": "watchos"]
      if let bpm = bpm { e["heartRate"] = Int(bpm) }
      emit(e)
    }
  }
  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
