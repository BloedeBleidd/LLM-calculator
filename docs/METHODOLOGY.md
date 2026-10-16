# Calculation methodology

This is a single-session, autoregressive decode estimate for up to four GPUs and one CPU/RAM block. It does not load a model or run an inference benchmark. The estimator is implemented in `src/engine.js`, separately from browser state and rendering.

## Units and model size

All memory quantities are decimal: 1 GB = 10^9 bytes; 1 MB = 10^6 bytes; 1000 MB = 1 GB. Convert GiB explicitly when using measurements reported in binary units. TFLOPS means 10^12 floating-point operations per second.

For `L` uniform layers:

```text
weights_GB       = total_parameters_B * bytes_per_parameter
stored_GB        = weights_GB + KV_storage_GB
read_GB/token    = active_parameters_B * bytes_per_parameter + KV_read_GB/token
FLOPs/token      = active_parameters_B * 10^9 * FLOPs_per_parameter
storage/layer    = stored_GB / L
read/layer       = read_GB/token / L
FLOPs/layer      = FLOPs/token / L
```

Dense mode uses the total parameter count for active parameters. MoE mode keeps storage and active work separate. KV storage and effective read traffic are independent inputs: cache reuse can lower reads, while rereads can increase traffic. Changing the read estimate does not change model capacity. Use benchmark-derived effective figures where possible.

## Capacity and placement

Each GPU's usable memory is installed VRAM minus that GPU's reservation. A zero-VRAM slot is disabled. Usable RAM is memory available for CPU-executed layers after other host allocations; zero disables CPU offload. Disk swapping, host copies required by individual engines and further runtime allocations are not automatically modeled.

Capacity is `floor(usable_GB / storage_per_layer)`, capped at `L`. A machine can have sufficient total bytes and still fail to fit complete layers because of per-device fragmentation. A roundoff tolerance of 16 machine epsilons avoids dropping an exactly fitting layer; it does not reserve extra physical memory.

Infeasible configurations have no latency or tokens/second estimate. CPU/RAM is no longer an unlimited fallback.

## Timing and optimization

```text
memory_time/layer  = read_GB/layer / memory_bandwidth_GB/s
compute_time/layer = FLOPs/layer / (effective_TFLOPS * 10^12)
block_time         = layer_count * max(memory_time/layer, compute_time/layer)
```

The maximum is a simplified Roofline approximation, not a simulation of separate kernels. See [NVIDIA's Roofline profiling guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/#roofline-charts).

For every nonempty subset of capacity-bearing devices, assign one layer to each device, then fill the fastest per-layer devices first. This is optimal **for the stated uniform-layer, constant-per-layer-cost model**: after the mandatory layers, moving a layer from a slower device to an available faster one cannot increase processing time. Transfers depend on which blocks are adjacent, not on their layer counts. Every ordering of the chosen subset is evaluated, and the fastest feasible result is retained.

The tests compare this optimizer with an independent exhaustive search over every layer allocation and order in small heterogeneous systems. Real layers need not have equal sizes or costs. Runtime device order and CPU placement can also be constrained; the optimizer does not enforce those engine-specific restrictions.

## Transfers and baseline

For activation volume `A` in GB, PCIe rates `Pa`, `Pb`, and RAM bandwidth `R`:

```text
GPU → GPU, P2P:  A / min(Pa, Pb)
GPU → RAM → GPU: A/Pa + 2*A/R + A/Pb
GPU ↔ CPU:       A/Pgpu + A/R
latency/token:   sum(block_times) + sum(boundary_times)
tokens/second:   1 / latency
```

PCIe generation values are rounded link ceilings, not measured payload throughput. The host-staging model is deliberately serial and does not model DMA overlap, contention, shared switches, NUMA or NVLink. Selecting P2P assumes the hardware, driver and inference engine support that path.

The baseline considers CPU-only and every enabled GPU paired with the same CPU/RAM capacity, retaining the fastest feasible candidate. It uses at most one GPU and does not assume GPU 1 is enabled. An infeasible baseline is explicitly marked unavailable.

## Limits

No prompt prefill, continuous batching, tensor-parallel collectives, expert-specific placement, kernel launch overhead, speculative decoding or automatic model metadata lookup is modeled. The [llama.cpp CLI documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/cli/README.md) distinguishes layer and tensor split modes; this calculator models a sequential layer chain. Calibrate with the same model, quantization, context, engine and hardware that you plan to compare.
