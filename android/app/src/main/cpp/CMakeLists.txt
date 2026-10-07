# The app's native library: the engine (the repo's engine/, the same sources as the Windows DLL), its C API,
# and mini.cpp (Oboe audio, the bench, JNI). Oboe comes from its prefab AAR.
cmake_minimum_required(VERSION 3.22)
project(ammonite_mini LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(ENGINE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../engine)
find_package(oboe REQUIRED CONFIG)

add_library(ammonite_mini SHARED ${ENGINE_DIR}/Engine.cpp ${ENGINE_DIR}/api.cpp mini.cpp)
target_include_directories(ammonite_mini PRIVATE ${ENGINE_DIR})
# optimised in debug builds too: the bench and the audio callback are what this app measures
target_compile_options(ammonite_mini PRIVATE -O2 -Wall -Wno-unused-function)
target_link_libraries(ammonite_mini PRIVATE oboe::oboe log android)
