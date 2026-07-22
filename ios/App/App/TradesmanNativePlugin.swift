import Foundation
import Capacitor
import AVFoundation
import UIKit

/**
 * Native helpers for FCM readiness + softphone speaker / Phone routing + external deep links.
 */
@objc(TradesmanNativePlugin)
public class TradesmanNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TradesmanNativePlugin"
    public let jsName = "TradesmanNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getFcmAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareCallAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeakerOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetCallAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternalUrl", returnType: CAPPluginReturnPromise),
    ]

    @objc func getFcmAvailability(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    @objc func prepareCallAudio(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)
            try session.overrideOutputAudioPort(.none)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func setSpeakerOn(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)
            try session.overrideOutputAudioPort(enabled ? .speaker : .none)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func resetCallAudio(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.overrideOutputAudioPort(.none)
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func openExternalUrl(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("url required")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { ok in
                if ok { call.resolve() } else { call.reject("Could not open URL") }
            }
        }
    }
}
