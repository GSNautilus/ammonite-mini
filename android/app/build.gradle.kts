plugins {
    id("com.android.application")
}

android {
    namespace = "com.ammonite.mini"
    compileSdk = 35
    ndkVersion = "30.0.16248370"

    defaultConfig {
        applicationId = "com.ammonite.mini"
        minSdk = 33 // the tablet runs Android 14+; 33 has the performance-hint API
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
        ndk { abiFilters += "arm64-v8a" } // the tablet's only ABI
        externalNativeBuild {
            cmake { arguments += listOf("-DANDROID_STL=c++_shared") } // as Oboe's prefab AAR
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug") // sideloading only, until phase 4
        }
    }
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "4.1.2"
        }
    }
    buildFeatures { prefab = true }
}

dependencies {
    implementation("com.google.oboe:oboe:1.11.0")
}
