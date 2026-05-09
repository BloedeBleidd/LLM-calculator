# LLM Multi-GPU Optimizer

A static browser-based calculator for estimating local LLM decode performance across multi-GPU systems.

The project helps compare hardware configurations by modeling:

- Dense and MoE models
- VRAM usage and layer allocation
- Multi-GPU layer splitting
- PCIe transfer overhead
- CPU/RAM offload
- Memory bandwidth and compute bottlenecks
- Estimated tokens per second and per-token latency

The calculator is intended as an engineering estimation tool, not an exact benchmark. Real performance depends on the inference engine, drivers, kernels, quantization format, batching, memory layout, and system topology.

## Purpose

This tool is useful for answering questions such as:

- Will a model fit into available VRAM?
- Does adding another GPU improve decode speed?
- Is the setup limited by VRAM bandwidth, compute, PCIe, or RAM?
- How does a Dense model compare with an MoE model?
- How much performance is lost when CPU/RAM offload is required?

## Accuracy

The results should be treated as estimates.

For best results, calibrate the inputs against a real inference benchmark by adjusting values such as:

- Effective GPU TFLOPS
- KV cache size
- Activation transfer size
- CPU effective TFLOPS
- RAM bandwidth

Configuration rankings are usually more reliable than the absolute tokens-per-second value.

## Reporting Issues

Please open an issue if you find:

- Incorrect calculations
- Broken UI behavior
- Misleading descriptions
- Browser compatibility problems
- Missing hardware or model assumptions
- Suggestions that would improve accuracy or usability

When reporting an issue, include:

- Browser and operating system
- GPU configuration if relevant
- Input values used in the calculator
- Expected result
- Actual result
- Screenshot if helpful

## Pull Requests

Pull requests are welcome.

Good pull requests should:

- Keep the project simple and dependency-free
- Improve calculation accuracy, usability, or documentation
- Avoid unnecessary visual or architectural complexity
- Include a clear explanation of the change
- Keep the calculator usable as a static browser page

Before opening a pull request, please make sure the UI still works correctly on both desktop and mobile screen sizes.

## License

This project is licensed under the Apache License 2.0.
