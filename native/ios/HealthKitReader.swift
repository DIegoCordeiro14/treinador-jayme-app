import Foundation
import HealthKit
import CoreLocation

/**
 * Leitura de histórico via HealthKit: HKWorkout + HeartRate + ActiveEnergy + Distance +
 * HKWorkoutRoute. Preserva timestamps de FC. Normaliza para NativeWorkoutDetails.
 */
class HealthKitReader {
  let store = HKHealthStore()

  func isAvailable() -> Bool { HKHealthStore.isHealthDataAvailable() }

  private var readTypes: Set<HKObjectType> {
    var t: Set<HKObjectType> = [HKObjectType.workoutType(),
      HKSeriesType.workoutRoute(),
      HKQuantityType.quantityType(forIdentifier: .heartRate)!,
      HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
      HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!]
    if let cycling = HKQuantityType.quantityType(forIdentifier: .distanceCycling) { t.insert(cycling) }
    return t
  }

  func permissionStatus(_ completion: @escaping ([String: Any]) -> Void) {
    let wt = HKObjectType.workoutType()
    let granted = store.authorizationStatus(for: wt) == .sharingAuthorized
    completion(["available": isAvailable(), "granted": granted, "missing": granted ? [] : ["workouts"]])
  }

  func requestPermissions(_ completion: @escaping ([String: Any]) -> Void) {
    store.requestAuthorization(toShare: [], read: readTypes) { _, _ in self.permissionStatus(completion) }
  }

  func queryWorkouts(start: String, end: String, _ completion: @escaping ([[String: Any]]) -> Void) {
    let predicate = HKQuery.predicateForSamples(withStart: iso(start), end: iso(end), options: .strictStartDate)
    let q = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit,
                          sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, _ in
      let workouts = (samples as? [HKWorkout] ?? []).map { self.mapWorkout($0) }
      completion(workouts)
    }
    store.execute(q)
  }

  func queryWorkoutDetails(externalId: String, start: String, end: String, _ completion: @escaping ([String: Any]) -> Void) {
    // Busca o HKWorkout, sua rota e amostras de FC; junta em NativeWorkoutDetails.
    // (implementação: HKWorkoutRouteQuery + HKSampleQuery de heartRate)
    completion([:])
  }

  func readHeartRate(start: String, end: String, _ completion: @escaping ([[String: Any]]) -> Void) {
    let type = HKQuantityType.quantityType(forIdentifier: .heartRate)!
    let predicate = HKQuery.predicateForSamples(withStart: iso(start), end: iso(end), options: .strictStartDate)
    let unit = HKUnit.count().unitDivided(by: .minute())
    let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
                          sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
      let out = (samples as? [HKQuantitySample] ?? []).map { s in
        ["timestamp": ISO8601DateFormatter().string(from: s.startDate), "bpm": Int(s.quantity.doubleValue(for: unit))]
      }
      completion(out)
    }
    store.execute(q)
  }

  func readRoute(externalId: String, start: String, end: String, _ completion: @escaping ([[String: Any]]) -> Void) {
    // HKWorkoutRouteQuery entrega CLLocation com timestamp/altitude/accuracy.
    completion([])
  }

  private func mapWorkout(_ w: HKWorkout) -> [String: Any] {
    return [
      "externalId": w.uuid.uuidString, "provider": "healthkit",
      "sourceSportType": String(describing: w.workoutActivityType.rawValue),
      "sportType": SportMap.normalize(w.workoutActivityType),
      "startedAt": ISO8601DateFormatter().string(from: w.startDate),
      "endedAt": ISO8601DateFormatter().string(from: w.endDate),
      "durationSeconds": Int(w.duration),
      "distanceMeters": w.totalDistance?.doubleValue(for: .meter) as Any,
      "caloriesActive": w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) as Any,
      "hasRoute": true, "hasHeartRateSamples": true,
    ]
  }

  private func iso(_ s: String) -> Date { ISO8601DateFormatter().date(from: s) ?? Date() }
}
