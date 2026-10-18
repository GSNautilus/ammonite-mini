import java.util.Properties

plugins {
    id("com.android.application")
}

// Release signing: a keystore kept outside the repo, described by a properties file (storeFile, storePassword,
// keyAlias, keyPassword) at $AMMONITE_MINI_SIGNING, else ~/keys/ammonite-mini-release.properties. Without one
// the release APK is built unsigned.
val signingFile = file(System.getenv("AMMONITE_MINI_SIGNING")
    ?: "${System.getProperty("user.home")}/keys/ammonite-mini-release.properties")
val signing = Properties().apply { if (signingFile.exists()) signingFile.inputStream().use { load(it) } }

android {
    namespace = "com.ammonite.mini"
    compileSdk = 35
    ndkVersion = "30.0.16248370"

    defaultConfig {
        applicationId = "com.ammonite.mini"
        minSdk = 33 // the tablet runs Android 14+; 33 has the performance-hint API
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["appLabel"] = "Ammonite Mini"
        ndk { abiFilters += "arm64-v8a" } // the tablet's only ABI
        externalNativeBuild {
            cmake { arguments += listOf("-DANDROID_STL=c++_shared") } // as Oboe's prefab AAR
        }
    }
    signingConfigs {
        if (signingFile.exists()) create("release") {
            storeFile = file(signing.getProperty("storeFile"))
            storePassword = signing.getProperty("storePassword")
            keyAlias = signing.getProperty("keyAlias")
            keyPassword = signing.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
        // signed with the debug key: an app of its own beside the release, so neither has to be uninstalled for the other
        debug {
            applicationIdSuffix = ".dev"
            manifestPlaceholders["appLabel"] = "Ammonite Mini dev"
        }
    }
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "4.1.2"
        }
    }
    buildFeatures { prefab = true }
    // the page straight from the repo's web/ (no copy): served from the APK as https://appassets.androidplatform.net
    sourceSets { getByName("main") { assets.directories.add("../../web") } }
}

dependencies {
    implementation("com.google.oboe:oboe:1.11.0")
    implementation("androidx.webkit:webkit:1.17.1") // WebMessageListener, WebViewAssetLoader
}
