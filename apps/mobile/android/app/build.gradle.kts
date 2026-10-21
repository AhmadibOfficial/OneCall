import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val oneCallSigning = Properties()
val oneCallSigningFile = rootProject.file("key.properties")
if (oneCallSigningFile.exists()) {
    oneCallSigningFile.inputStream().use { oneCallSigning.load(it) }
}
val oneCallApplicationId = providers.environmentVariable("ONECALL_APPLICATION_ID")
    .orElse("com.example.onecall").get()
fun requireOneCallRelease() {
    require(oneCallApplicationId.matches(Regex("[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){2,}")) &&
        !oneCallApplicationId.startsWith("com.example.")) {
        "Set ONECALL_APPLICATION_ID to your final owned application ID before release."
    }
    require(oneCallSigningFile.exists() &&
        listOf("storeFile", "storePassword", "keyAlias", "keyPassword").all { !oneCallSigning.getProperty(it).isNullOrBlank() } &&
        oneCallSigning.getProperty("keyAlias") != "androiddebugkey" &&
        rootProject.file(oneCallSigning.getProperty("storeFile")).isFile) {
        "Configure a private upload keystore in android/key.properties before release."
    }
}
if (gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }) {
    requireOneCallRelease()
}
tasks.configureEach {
    if (name.contains("release", ignoreCase = true)) doFirst { requireOneCallRelease() }
}

android {
    namespace = "com.example.onecall"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        manifestPlaceholders["onecallMapsKey"] = providers.environmentVariable("ONECALL_MAPS_API_KEY").orElse("").get()
        // Debug retains its existing ID unless an owned ID is supplied.
        applicationId = oneCallApplicationId
        // Some plugin AARs contain other ABIs even when Flutter targets x64.
        // Keep the separately installed emulator pilot small and x86_64-only.
        if (oneCallApplicationId == "com.example.onecall.localpilot") {
            ndk {
                abiFilters.clear()
                abiFilters.add("x86_64")
            }
        }
        // The USB phone pilot contains both supported ARM architectures.
        if (oneCallApplicationId == "com.example.onecall.localphone") {
            ndk {
                abiFilters.clear()
                abiFilters.addAll(listOf("armeabi-v7a", "arm64-v8a"))
            }
        }
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (oneCallSigningFile.exists()) {
                keyAlias = oneCallSigning.getProperty("keyAlias")
                keyPassword = oneCallSigning.getProperty("keyPassword")
                storeFile = oneCallSigning.getProperty("storeFile")?.let { rootProject.file(it) }
                storePassword = oneCallSigning.getProperty("storePassword")
            }
        }
    }
    buildTypes {
        release { signingConfig = signingConfigs.getByName("release") }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
