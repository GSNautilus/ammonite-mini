# Ammonite Mini, Windows side: the engine as a DLL with its C API (engine/api.h), so the Python tests in
# tests/engine drive it headless, as on desktop. The Android build (phase 1, the app) has its own CMakeLists
# under android/ and compiles the same engine/ sources. Built by mini.ps1 (MSVC + CMake + Ninja).
cmake_minimum_required(VERSION 3.15)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

project(AmmoniteMini VERSION 0.1.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---- the engine: a static library, and a DLL with the C API for the tests (as desktop's CMakeLists)
add_library(ammonite_engine_lib STATIC engine/Engine.cpp)
target_include_directories(ammonite_engine_lib PUBLIC engine)
target_compile_definitions(ammonite_engine_lib PUBLIC _USE_MATH_DEFINES _CRT_SECURE_NO_WARNINGS NOMINMAX)
add_library(ammonite_engine SHARED engine/api.cpp)
target_link_libraries(ammonite_engine PRIVATE ammonite_engine_lib)
set_target_properties(ammonite_engine PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${PROJECT_BINARY_DIR}/bin/$<0:>"
  PREFIX "")
if(MSVC)
  target_compile_options(ammonite_engine_lib PUBLIC /W3 /fp:precise)
endif()
