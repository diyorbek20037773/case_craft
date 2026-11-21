# Realistic characters (Microsoft Rocketbox)

Source: Microsoft Rocketbox Avatar Library - https://github.com/microsoft/Microsoft-Rocketbox
License: MIT (stated in the repo README, "November 2020 License Update"). Keep this notice with the files.
Copyright (c) Microsoft Corporation. Citation (optional, academic): Gonzalez-Franco et al., "The Rocketbox library and the utility of freely available rigged avatars", Frontiers in Virtual Reality, 2020.

| File | Role | Original avatar | Animations (clips) |
|---|---|---|---|
| judge.glb | raislik | Professions/Business_Male_03 | m_idle_breathe_01 (Idle), m_sit_table_idle_neutral_01 (SitIdle), m_gestic_talk_neutral_01 (Talk) |
| prosecutor.glb | prokuror | Professions/Police_Male_01 (uniform, cap) | same male clips |
| clerk.glb | kotib (ayol) | Professions/Business_Female_02 | f_idle_breathe_01, f_sit_table_idle_neutral_01, f_gestic_talk_neutral_01 |
| witness.glb | guvoh | Adults/Male_Adult_08 | male clips |
| defender.glb | himoyachi | Professions/Business_Male_01 | male clips |

Animations: Assets/Animations/all_animations_max_motextr_static (Rocketbox, MIT).

Processing: *_facial.fbx -> FBX2glTF -> textures (TGA 2048) downscaled to 1024 and re-attached -> kept 15 viseme + 52 ARKit morph targets (of 175), renamed to Oculus (viseme_sil, viseme_PP, viseme_FF, viseme_TH, viseme_DD, viseme_kk, viseme_CH, viseme_SS, viseme_nn, viseme_RR, viseme_aa, viseme_E, viseme_I, viseme_O, viseme_U) and ARKit camelCase (jawOpen, eyeBlinkLeft, mouthSmileLeft ...) -> gltf-transform optimize (meshopt, webp, 1024). Files use EXT_meshopt_compression and EXT_texture_webp (drei useGLTF handles both).
Clips: Idle, SitIdle, Talk (Bip01 skeleton, 80 joints, NOT Mixamo/RPM names).
