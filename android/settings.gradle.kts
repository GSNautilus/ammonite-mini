// Ammonite Mini, the Android app (docs/MINI_PLAN.md section 3). Built by mini.ps1 (apk | install | run).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "AmmoniteMini"
include(":app")
