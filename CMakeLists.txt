cmake_minimum_required(VERSION 3.15)
project(riagjs LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_definitions(-DNAPI_VERSION=6)
add_definitions(-DNODE_RUNTIME=node)
add_definitions(-DBUILDING_NODE_EXTENSION)

set(RIAG_SOURCE_DIR "" CACHE PATH "Path to the RiaGraph source tree used for standalone Node.js builds")
set(RIAG_BUILD_DIR "" CACHE PATH "Path to the RiaGraph build tree used for standalone Node.js builds")
set(RIAG_NODEJS_EXTRA_LINK_LIBS "" CACHE STRING "Additional link libraries for standalone Node.js builds against a precompiled libriag")

function(riag_nodejs_set_default_dir out_var suffix)
  foreach(base_dir IN ITEMS "${RIAG_SOURCE_DIR}" "${CMAKE_SOURCE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}/../.." "${CMAKE_CURRENT_SOURCE_DIR}/../riagraph")
    if(base_dir AND EXISTS "${base_dir}/${suffix}")
      set(${out_var} "${base_dir}/${suffix}" PARENT_SCOPE)
      return()
    endif()
  endforeach()
  set(${out_var} "" PARENT_SCOPE)
endfunction()

# If on Windows use npx.cmd instead of npx
if(WIN32)
  set(NPX_CMD npx.cmd)
else()
  set(NPX_CMD npx)
endif()

execute_process(
  COMMAND ${NPX_CMD} cmake-js print-cmakejs-include
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE CMAKE_JS_INC
  ERROR_QUIET
)
execute_process(
  COMMAND ${NPX_CMD} cmake-js print-cmakejs-lib
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE CMAKE_JS_LIB
  ERROR_QUIET
)
execute_process(
  COMMAND ${NPX_CMD} cmake-js print-cmakejs-src
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE CMAKE_JS_SRC
  ERROR_QUIET
)
execute_process(
  COMMAND node -p "process.config.variables.node_prefix || ''"
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_PREFIX
  ERROR_QUIET
)

# Without this windows breaks with:  Invalid character escape '\P'.
string(REPLACE "\\" "/" CMAKE_JS_INC "${CMAKE_JS_INC}")
string(REPLACE "\\" "/" CMAKE_JS_LIB "${CMAKE_JS_LIB}")
string(REPLACE "\\" "/" CMAKE_JS_SRC "${CMAKE_JS_SRC}")

# cmake-js v8 pollutes stdout with log messages (INFO, WARN) before printing
# the actual value. The actual value is always the LAST line of output (from
# console.info() in bin/cmake-js). Some log messages span multiple lines (e.g.
# find-visualstudio: "INFO ... found at:\n\"C:/path\"\nrun with --verbose"),
# so we can't simply strip lines starting with INFO/WARN.
#
# Strategy: strip trailing whitespace, extract only the last line (everything
# after the final \n), then clear any remaining value that isn't a valid path.
# On Linux, when cmake-js returns an empty value, the only output is the INFO
# log line itself (single line, no \n), which must also be cleared.
string(STRIP "${CMAKE_JS_INC}" CMAKE_JS_INC)
string(STRIP "${CMAKE_JS_LIB}" CMAKE_JS_LIB)
string(STRIP "${CMAKE_JS_SRC}" CMAKE_JS_SRC)
string(STRIP "${NODE_PREFIX}" NODE_PREFIX)
# Extract last line: remove everything up to and including the last newline.
string(REGEX REPLACE ".*\n" "" CMAKE_JS_INC "${CMAKE_JS_INC}")
string(REGEX REPLACE ".*\n" "" CMAKE_JS_LIB "${CMAKE_JS_LIB}")
string(REGEX REPLACE ".*\n" "" CMAKE_JS_SRC "${CMAKE_JS_SRC}")
# Clear any value that is not a valid path (e.g. a leftover single-line INFO/WARN log).
# Valid cmake-js values are absolute paths starting with / or a drive letter (e.g. C:/).
if(NOT CMAKE_JS_INC MATCHES "^(/|[A-Za-z]:)")
  set(CMAKE_JS_INC "")
endif()
if(NOT CMAKE_JS_LIB MATCHES "^(/|[A-Za-z]:)")
  set(CMAKE_JS_LIB "")
endif()
if(NOT CMAKE_JS_SRC MATCHES "^(/|[A-Za-z]:)")
  set(CMAKE_JS_SRC "")
endif()
if(NOT CMAKE_JS_INC AND NODE_PREFIX MATCHES "^(/|[A-Za-z]:)")
  set(CMAKE_JS_INC "${NODE_PREFIX}/include/node")
endif()
if(WIN32 AND NOT CMAKE_JS_LIB AND NODE_PREFIX MATCHES "^(/|[A-Za-z]:)")
  set(CMAKE_JS_LIB "${NODE_PREFIX}/lib/node.lib")
endif()

# Print CMAKE_JS variables
message(STATUS "CMake.js configurations: LIB=${CMAKE_JS_LIB}, INC=${CMAKE_JS_INC}, SRC=${CMAKE_JS_SRC}")

get_filename_component(NODE_ADDON_API_INCLUDE_PATH ./node_modules/node-addon-api ABSOLUTE)

include_directories(${CMAKE_JS_INC})
include_directories(${NODE_ADDON_API_INCLUDE_PATH})

option(RIAG_NODEJS_ENABLE_TEST_EXPORTS
    "Export test-only native helpers (e.g. createArrowCSRTestData). Enable for dev/test builds only; never ship in production."
    OFF)

file(GLOB CPP_SOURCE_FILES ./src_cpp/*.cpp)

if(NOT RIAG_NODEJS_ENABLE_TEST_EXPORTS)
    list(REMOVE_ITEM CPP_SOURCE_FILES "${CMAKE_CURRENT_SOURCE_DIR}/src_cpp/node_arrow_test_utils.cpp")
endif()

file(GLOB JS_SOURCE_FILES 
    ./src_js/*.js
    ./src_js/*.mjs
    ./src_js/*.d.ts
)
# Copy all JS/TS files to build directory
file(COPY ${JS_SOURCE_FILES} DESTINATION  "${CMAKE_CURRENT_SOURCE_DIR}/build")

set(NODEJS_RIAG_LINK_DEPS "")
if(NOT TARGET riag)
  if(NOT RIAG_NODEJS_USE_PRECOMPILED_LIB)
    message(FATAL_ERROR "The Node.js addon requires the riag target or RIAG_NODEJS_USE_PRECOMPILED_LIB=TRUE.")
  endif()
  if(NOT RIAG_NODEJS_PRECOMPILED_LIB_PATH)
    message(FATAL_ERROR "RIAG_NODEJS_PRECOMPILED_LIB_PATH must point to a precompiled static libriag archive.")
  endif()
  if(NOT EXISTS "${RIAG_NODEJS_PRECOMPILED_LIB_PATH}")
    message(FATAL_ERROR "Precompiled libriag archive not found: ${RIAG_NODEJS_PRECOMPILED_LIB_PATH}")
  endif()

  riag_nodejs_set_default_dir(RIAG_NODEJS_SOURCE_INCLUDE_DIR "src/include")
  set(RIAG_NODEJS_BUILD_INCLUDE_DIR "")
  if(RIAG_BUILD_DIR AND EXISTS "${RIAG_BUILD_DIR}/src/include")
    set(RIAG_NODEJS_BUILD_INCLUDE_DIR "${RIAG_BUILD_DIR}/src/include")
  elseif(RIAG_SOURCE_DIR AND EXISTS "${RIAG_SOURCE_DIR}/build/release/src/include")
    set(RIAG_NODEJS_BUILD_INCLUDE_DIR "${RIAG_SOURCE_DIR}/build/release/src/include")
  elseif(EXISTS "${CMAKE_BINARY_DIR}/src/include")
    set(RIAG_NODEJS_BUILD_INCLUDE_DIR "${CMAKE_BINARY_DIR}/src/include")
  elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../../build/release/src/include")
    set(RIAG_NODEJS_BUILD_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../build/release/src/include")
  elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../riagraph/build/release/src/include")
    set(RIAG_NODEJS_BUILD_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../riagraph/build/release/src/include")
  endif()

  if(NOT RIAG_NODEJS_SOURCE_INCLUDE_DIR)
    message(FATAL_ERROR "Could not determine the RiaGraph source include directory. Set RIAG_SOURCE_DIR to a RiaGraph checkout.")
  endif()
  if(NOT RIAG_NODEJS_BUILD_INCLUDE_DIR)
    message(FATAL_ERROR "Could not determine the RiaGraph build include directory. Set RIAG_BUILD_DIR or RIAG_SOURCE_DIR to a built RiaGraph tree.")
  endif()

  add_library(riag STATIC IMPORTED GLOBAL)
  set_target_properties(riag PROPERTIES IMPORTED_LOCATION "${RIAG_NODEJS_PRECOMPILED_LIB_PATH}")
  target_include_directories(riag INTERFACE
    "${RIAG_NODEJS_SOURCE_INCLUDE_DIR}"
    "${RIAG_NODEJS_BUILD_INCLUDE_DIR}")
  if(WIN32)
    target_compile_definitions(riag INTERFACE RIAG_STATIC_DEFINE)
  endif()
  if(TARGET riag_link_deps)
    set(NODEJS_RIAG_LINK_DEPS "$<LINK_ONLY:riag_link_deps>")
  endif()
endif()

add_library(riagjs SHARED ${CPP_SOURCE_FILES})
if(CMAKE_JS_SRC)
  target_sources(riagjs PRIVATE "${CMAKE_JS_SRC}")
endif()
set_target_properties(riagjs PROPERTIES PREFIX "" SUFFIX ".node")
set_target_properties(riagjs
  PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
  ARCHIVE_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build")
if(APPLE)
  target_link_options(riagjs PRIVATE -undefined dynamic_lookup)
else()
  target_link_options(riagjs PRIVATE -Wl,--export-dynamic)
endif()
target_link_libraries(riagjs PRIVATE riag ${NODEJS_RIAG_LINK_DEPS} ${CMAKE_JS_LIB})
if(RIAG_NODEJS_EXTRA_LINK_LIBS)
  target_link_libraries(riagjs PRIVATE ${RIAG_NODEJS_EXTRA_LINK_LIBS})
endif()
if(RIAG_NODEJS_ENABLE_TEST_EXPORTS)
  target_compile_definitions(riagjs PRIVATE RIAG_ENABLE_TEST_EXPORTS)
  message(STATUS "riagjs: test-only exports enabled (RIAG_NODEJS_ENABLE_TEST_EXPORTS=ON)")
endif()
