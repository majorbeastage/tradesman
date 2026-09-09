import Foundation
import Capacitor
import AVFoundation
import UIKit
import PhotosUI

/**
 * Native helpers for FCM readiness + softphone speaker / Phone routing + external deep links + iPad-safe photo pick.
 */
@objc(TradesmanNativePlugin)
public class TradesmanNativePlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate, UIPopoverPresentationControllerDelegate {
    public let identifier = "TradesmanNativePlugin"
    public let jsName = "TradesmanNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getFcmAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareCallAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeakerOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetCallAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternalUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCameraAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMicrophoneAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickImage", returnType: CAPPluginReturnPromise),
    ]

    private var imageCall: CAPPluginCall?

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

    @objc func requestCameraAccess(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .authorized {
            call.resolve(["granted": true])
            return
        }
        if status == .denied || status == .restricted {
            call.resolve(["granted": false])
            return
        }
        AVCaptureDevice.requestAccess(for: .video) { granted in
            call.resolve(["granted": granted])
        }
    }

    @objc func requestMicrophoneAccess(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            call.resolve(["granted": granted])
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

    @objc func pickImage(_ call: CAPPluginCall) {
        let source = (call.getString("source") ?? "prompt").lowercased()
        DispatchQueue.main.async {
            self.beginPickImage(call, source: source)
        }
    }

    private func beginPickImage(_ call: CAPPluginCall, source: String) {
        guard let vc = self.bridge?.viewController else {
            call.reject("Camera is unavailable right now.")
            return
        }
        if imageCall != nil {
            call.reject("A photo picker is already open.")
            return
        }
        imageCall = call
        call.keepAlive = true

        if source == "camera" {
            presentCamera(from: vc)
            return
        }
        if source == "photos" {
            presentPhotoLibrary(from: vc)
            return
        }

        let sheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            sheet.addAction(UIAlertAction(title: "Take Photo", style: .default) { _ in
                self.presentCamera(from: vc)
            })
        }
        sheet.addAction(UIAlertAction(title: "Photo Library", style: .default) { _ in
            self.presentPhotoLibrary(from: vc)
        })
        sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            self.finishImagePick(["cancelled": true])
        })
        configurePopover(sheet, from: vc)
        vc.present(sheet, animated: true)
    }

    private func presentCamera(from vc: UIViewController) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            finishImagePick(["cancelled": false, "error": "This device does not have a camera. Choose Photo Library instead."])
            return
        }
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        let openPicker = {
            DispatchQueue.main.async {
                let picker = UIImagePickerController()
                picker.sourceType = .camera
                picker.allowsEditing = false
                picker.delegate = self
                // Full screen avoids the iPad popover crash (nil sourceView on WKWebView file inputs).
                picker.modalPresentationStyle = .fullScreen
                self.configurePopover(picker, from: vc)
                vc.present(picker, animated: true)
            }
        }
        if status == .authorized {
            openPicker()
            return
        }
        if status == .denied || status == .restricted {
            finishImagePick(["cancelled": false, "error": "Camera access was not allowed. Open Settings → Tradesman → Camera and turn it on."])
            return
        }
        AVCaptureDevice.requestAccess(for: .video) { granted in
            if granted {
                openPicker()
            } else {
                self.finishImagePick(["cancelled": false, "error": "Camera access was not allowed. Open Settings → Tradesman → Camera and turn it on."])
            }
        }
    }

    private func presentPhotoLibrary(from vc: UIViewController) {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        picker.modalPresentationStyle = .pageSheet
        configurePopover(picker, from: vc)
        vc.present(picker, animated: true)
    }

    private func configurePopover(_ presented: UIViewController, from host: UIViewController) {
        guard UIDevice.current.userInterfaceIdiom == .pad,
              let pop = presented.popoverPresentationController else { return }
        pop.sourceView = host.view
        pop.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 1, height: 1)
        pop.permittedArrowDirections = []
        pop.delegate = self
    }

    private func finishImagePick(_ payload: [String: Any]) {
        DispatchQueue.main.async {
            let call = self.imageCall
            self.imageCall = nil
            call?.resolve(payload)
        }
    }

    private func resolvePickedImage(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.85) else {
            finishImagePick(["cancelled": false, "error": "Could not read that photo."])
            return
        }
        finishImagePick([
            "cancelled": false,
            "dataUrl": "data:image/jpeg;base64,\(data.base64EncodedString())",
            "mimeType": "image/jpeg",
            "fileName": "photo.jpg",
        ])
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) {
            self.finishImagePick(["cancelled": true])
        }
    }

    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let image = (info[.editedImage] as? UIImage) ?? (info[.originalImage] as? UIImage)
        picker.dismiss(animated: true) {
            if let image {
                self.resolvePickedImage(image)
            } else {
                self.finishImagePick(["cancelled": false, "error": "Could not read that photo."])
            }
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider else {
            finishImagePick(["cancelled": true])
            return
        }
        if provider.canLoadObject(ofClass: UIImage.self) {
            provider.loadObject(ofClass: UIImage.self) { object, error in
                if let image = object as? UIImage {
                    self.resolvePickedImage(image)
                } else {
                    self.finishImagePick(["cancelled": false, "error": error?.localizedDescription ?? "Could not read that photo."])
                }
            }
            return
        }
        finishImagePick(["cancelled": false, "error": "Could not read that photo."])
    }
}
