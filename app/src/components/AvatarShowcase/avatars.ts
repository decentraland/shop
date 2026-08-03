// The "Ready to use avatars" showcase data. Each avatar is a transparent cutout (rendered as an image);
// the card, its gradient and the bottom fade are drawn in CSS. Images are eager-imported and sorted by
// filename so they line up with LOOKS in reading order (avatar-01 -> avatar-25).
const modules = import.meta.glob<string>('../../assets/overview/avatars/avatar-*.webp', {
  eager: true,
  import: 'default'
})
const sources = Object.keys(modules)
  .sort()
  .map(key => modules[key])

export type Avatar = { src: string; frame: string; fade: string; urns: string[] }

// Per-card design + contents, in reading order:
//   frame - the card background gradient
//   fade  - the colour the bottom overlay dissolves the legs into
//   urns  - the wearables/emotes that make up the look; the card's "Add to cart" button resolves these
//           to catalog items and adds the ones currently on sale.
const LOOKS: ReadonlyArray<Omit<Avatar, 'src'>> = [
  {
    frame: 'linear-gradient(180deg, #050505, #3d3d3d)',
    fade: 'rgba(27, 27, 27, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x16ad175bafdf45cb618dd8b1e0bc0301d886e507:1',
      'urn:decentraland:matic:collections-v2:0x80c7fd374b1f524029ffd337001454bcccba2092:1',
      'urn:decentraland:matic:collections-v2:0x58628c490d2c8d4a9b59fba0ad730ecaabe5a212:0',
      'urn:decentraland:matic:collections-v2:0xad3d374d5da6c954e286863d7334d5d6ffda389b:0'
    ]
  },
  {
    frame: 'linear-gradient(170.52deg, #ff1bce 2.33%, #fb0202 111.75%)',
    fade: 'rgba(229, 20, 104, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x2cf05cd6b8c7a6eb9fc98eb0499dbc8837c1d58e:1',
      'urn:decentraland:matic:collections-v2:0x11c59ac0a8a4c3f92b40433a540615191588b6e9:0',
      'urn:decentraland:matic:collections-v2:0x92698f59b66431f0f858a43b817d03c637b57cb4:0',
      'urn:decentraland:matic:collections-v2:0x38414c55d46bc48c7e5c2a6f49da664595ec8bc1:0',
      'urn:decentraland:matic:collections-v2:0xdea4758862fd7cfd38523a8d4c171ebd31ee5599:0',
      'urn:decentraland:matic:collections-v2:0x33ac6fd9083b8f823cb78563e8953e7dd0933e82:0'
    ]
  },
  {
    frame: 'linear-gradient(15.86deg, #ff2fd5 2.12%, #5f15b9 100.77%)',
    fade: 'rgba(255, 47, 213, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x023a73d1cf10ed196f39700312a498b27c36e88e:3',
      'urn:decentraland:matic:collections-v2:0x87daffe709ec2a07707564eba8a145f80ec20ddf:0',
      'urn:decentraland:matic:collections-v2:0x3338d5294e0312dd39f77a725a65e1ab8f009fd0:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #ffc800 15.83%, #ff9d00 115.83%)',
    fade: 'rgba(255, 157, 0, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x6e5fae8ccef6b6b08cefe2feca5ac6b68e2f4e90:1',
      'urn:decentraland:matic:collections-v2:0xf4de4caf22f23338843b68ac29cc451486f69746:0',
      'urn:decentraland:matic:collections-v2:0xec75c054b1cbdef424ab3e8b255860f6c2eb2a5d:0',
      'urn:decentraland:matic:collections-v2:0xec75c054b1cbdef424ab3e8b255860f6c2eb2a5d:1',
      'urn:decentraland:matic:collections-v2:0x23ec6017d07a31ea0c6e185ad9f7bc22eaa75270:2'
    ]
  },
  {
    frame: 'linear-gradient(0deg, #0caeff, #77ffc6)',
    fade: 'rgba(12, 174, 255, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x90f3d8780f8e32c0f1f937edfc0ad930b2e7347f:0',
      'urn:decentraland:matic:collections-v2:0xba7f33d73aa04b81cbee3f2ecf95f5d442939d0e:1',
      'urn:decentraland:matic:collections-v2:0x7a7d7b3c14324855d966d9164d3517dfc9334c3a:0',
      'urn:decentraland:matic:collections-v2:0x922814f775bbe4e4d7263db7d6d99595df567bb8:0',
      'urn:decentraland:matic:collections-v2:0x9d1b1451346b87661a1936c4398d3069a27ec4b5:0',
      'urn:decentraland:matic:collections-v2:0xea5fa934cb38cf3abb28190fad15c9dd4a0c90e8:0',
      'urn:decentraland:matic:collections-v2:0xeede64bfaf8055492aa500846ec7c6e6a9f533d5:3'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #fc3dff, #72d4b4)',
    fade: 'rgba(114, 212, 180, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0xf370aea38d9f4462236807b68d20c57fc814e1e9:0',
      'urn:decentraland:matic:collections-v2:0x6da6f4de96c5d6b797a4df9865f8a5dd1e9fd341:0',
      'urn:decentraland:matic:collections-v2:0x08de0de733cc11081d43569b809c00e6ddf314fb:1',
      'urn:decentraland:matic:collections-v2:0xae0aa900fbdbb8a96f1d136d43b6a8ab3555af4d:1',
      'urn:decentraland:matic:collections-v2:0xda2cfda208b9abbd6f8771f52cda1355e384d3ff:0',
      'urn:decentraland:matic:collections-v2:0xde65a3172c400187b65960f47b11f88ff98b9979:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #db6e6f, #ff0095)',
    fade: 'rgba(255, 0, 149, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x302dd98d9ca9954df96d43d5cbbae52ae360b0a0:1',
      'urn:decentraland:matic:collections-v2:0x4756b701a7d5d3416c8526b37eb34ca814687d99:0',
      'urn:decentraland:matic:collections-v2:0x2cf05cd6b8c7a6eb9fc98eb0499dbc8837c1d58e:1',
      'urn:decentraland:matic:collections-v2:0xc94ae17bc50acde481ad15afcab9eb751eec3c44:5',
      'urn:decentraland:matic:collections-v2:0x0b9caa480a3fb78c3355a0be07449c85bbc3cc0f:0',
      'urn:decentraland:matic:collections-v2:0x10021efd7fecbe66cc0da000d9e494052d21751f:0',
      'urn:decentraland:matic:collections-v2:0xca520eea5aadff51b48d9e9b3038001a751139ca:0',
      'urn:decentraland:matic:collections-v2:0xa2080031ba1201ea05a2a43b66c9ea6d22d7028e:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #ff0000, #29100e)',
    fade: 'rgba(14, 14, 14, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x89279ede6280cf64a6cf9b4b88d9ea852dfa93a4:0',
      'urn:decentraland:matic:collections-v2:0x65ed61c4fc2d1102ed574a48e664b90b7a300ea8:0',
      'urn:decentraland:matic:collections-v2:0x97b50485b2a9ed23cfe1bcc7bac86d07509141c3:0',
      'urn:decentraland:matic:collections-v2:0xe2e5c3dab7cabfd08bc4e1a936d5b2cf475e00b0:0',
      'urn:decentraland:matic:collections-v2:0x9d25f6b3080ce522e807ab6038a7f7b9c5e83110:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #ff0062, #150928)',
    fade: '#ad046c',
    urns: [
      'urn:decentraland:matic:collections-v2:0x92343fedf682f18ff65133e72b33205ad039d3b5:0',
      'urn:decentraland:matic:collections-v2:0xb16c1e230bfe3b53a82d873115d26f1ce3b73e7f:6',
      'urn:decentraland:matic:collections-v2:0x60574607c3adc7414132505c56087843f258531e:0',
      'urn:decentraland:matic:collections-v2:0x26db587aee669b1f4dbb87e577324a890e852b72:0',
      'urn:decentraland:matic:collections-v2:0x388323ad9a9da54a8581214a471040c66c6b7e5c:1',
      'urn:decentraland:matic:collections-v2:0x0c956c74518ed34afb7b137d9ddfdaea7ca13751:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #4323c1, #d700db)',
    fade: 'rgba(152, 0, 0, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x442950c405cb1181eadb8ad1ffbc17bb419db0f6:0',
      'urn:decentraland:matic:collections-v2:0xd0622c0b8185b52012cdb7c13baa321b4c70fcf0:2',
      'urn:decentraland:matic:collections-v2:0x70f553e2fe863c68fb2420f90d4a13854ee4f25e:0',
      'urn:decentraland:matic:collections-v2:0x834c4ba5c7b1b3fc0a732462d56a23dc3365052b:0',
      'urn:decentraland:matic:collections-v2:0xc1538b253b2435df4dc51088b0754b5c832455a7:0',
      'urn:decentraland:matic:collections-v2:0xca53b9436be1d663e050eb9ce523decbc656365c:0',
      'urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5:1'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #0e2768, #00e5ff)',
    fade: '#0b9dc2',
    urns: [
      'urn:decentraland:matic:collections-v2:0x936f7846db05297b33f19e38db87a879e8fc79a0:1',
      'urn:decentraland:matic:collections-v2:0xbbfb8014acb466df0ec6fe87081aa7263a63c2a3:0',
      'urn:decentraland:matic:collections-v2:0x4fde0297c458e7a0bc35f07c015f322ca31b459e:1',
      'urn:decentraland:matic:collections-v2:0xc7609b3eed4ddea40e7eccd29c8bd77a3937c88a:0',
      'urn:decentraland:matic:collections-v2:0xbae8b89b8865a6c22f28d39ca7d3bf2baebb384a:0',
      'urn:decentraland:matic:collections-v2:0x705652b66a12dcf782b0b3d5673fbf0c1797eba2:3'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #2c87ff, #001371)',
    fade: 'rgba(15, 0, 152, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0xfa97672f146b7a47f0791b7087cf3270d6f847ac:0',
      'urn:decentraland:matic:collections-v2:0xb187264af67cf6d147521626203dedcfd901ceb3:2',
      'urn:decentraland:matic:collections-v2:0xb187264af67cf6d147521626203dedcfd901ceb3:1',
      'urn:decentraland:matic:collections-v2:0xb187264af67cf6d147521626203dedcfd901ceb3:3'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #7e5ad5, #2a0090)',
    fade: 'rgba(84, 0, 152, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x14b37b06d76e8b4cc8e43336b841862df63058b2:2',
      'urn:decentraland:matic:collections-v2:0x5826113f948fe30978b822b210c7399dd4c0342a:0',
      'urn:decentraland:matic:collections-v2:0x42d62dbdc8248120385195b282b6b2f651661482:1',
      'urn:decentraland:matic:collections-v2:0x636a86b6d6c0c72f349ac8386ffee609afaf3330:2',
      'urn:decentraland:matic:collections-v2:0xaf7fd47de3cf70ca3dead1a56544733e115b178d:0',
      'urn:decentraland:matic:collections-v2:0xdd0242fe5e22ac76211fd6fa45fa9579294961c3:2',
      'urn:decentraland:matic:collections-v2:0xfb99d1b219d6d99a3ccdc7893769a620921fd938:0',
      'urn:decentraland:matic:collections-v2:0x8803d94e27b3844dd191fe354ec5d88b49c66f5d:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #e0e0e0, #3c3c3c)',
    fade: 'rgba(28, 28, 28, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x3f3cc81bfef127453c17ad24fffa8a760aa22cae:0',
      'urn:decentraland:matic:collections-v2:0xda2cfda208b9abbd6f8771f52cda1355e384d3ff:2',
      'urn:decentraland:matic:collections-v2:0x9944c10d25e62a0401c5a7113081388a52ce0e3c:0',
      'urn:decentraland:matic:collections-v2:0x705652b66a12dcf782b0b3d5673fbf0c1797eba2:0',
      'urn:decentraland:matic:collections-v2:0x705652b66a12dcf782b0b3d5673fbf0c1797eba2:11',
      'urn:decentraland:matic:collections-v2:0xadcdaa049904d31b192b0f868c3c68ecae928849:1',
      'urn:decentraland:matic:collections-v2:0x81a1e00cc33b5ae2405c54cc906e894de8174683:1'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #c953ff, #ae00ff)',
    fade: 'rgba(140, 0, 140, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x1c379f0a83320dbeff78a6b1f51097a27dd92556:0',
      'urn:decentraland:matic:collections-v2:0x8ab773121c775a09dcf2331c87dae3f4af76e81e:0',
      'urn:decentraland:matic:collections-v2:0xda2cfda208b9abbd6f8771f52cda1355e384d3ff:0',
      'urn:decentraland:matic:collections-v2:0x230feebcaac52481357197aad270f2d4486a147a:3',
      'urn:decentraland:matic:collections-v2:0x230feebcaac52481357197aad270f2d4486a147a:2',
      'urn:decentraland:matic:collections-v2:0x636a86b6d6c0c72f349ac8386ffee609afaf3330:1'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #2f323f, #7b83a5)',
    fade: 'rgba(123, 131, 165, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x487f7cc519dcffe91311b77d15ca7bc4a8f24991:4',
      'urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5:3',
      'urn:decentraland:matic:collections-v2:0xcc39ca501d62f5f751ca56f032b58918c1f880c0:0',
      'urn:decentraland:matic:collections-v2:0xfb26d0b332d8954b3a049276a0865c8f7d106c31:0',
      'urn:decentraland:matic:collections-v2:0x28e16e69e8df44224713558555d898faba2d1aef:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #e76ff9, #ffb200)',
    fade: 'rgba(255, 178, 0, 0.8)',
    urns: ['urn:decentraland:matic:collections-v2:0xba40702931855b6e575b7788bff4f4f0adf4f462:10']
  },
  {
    frame: 'linear-gradient(180deg, #374955, #78a1bb)',
    fade: 'rgba(120, 161, 187, 0.8)',
    urns: ['urn:decentraland:matic:collections-v2:0xba40702931855b6e575b7788bff4f4f0adf4f462:10']
  },
  {
    frame: 'linear-gradient(180deg, #c0ebfd 9.14%, #ff9de8)',
    fade: 'rgba(255, 157, 232, 0.8)',
    urns: ['urn:decentraland:matic:collections-v2:0xe9a19898cc03f15f3b665a35f2876b6c54918f2e:2']
  },
  {
    frame: 'linear-gradient(180deg, #ed4f00, #ede16a)',
    fade: 'rgba(237, 225, 106, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0xe9f388ae27c726c4772c85a194e9791b1a0a913c:0',
      'urn:decentraland:matic:collections-v2:0xfe1662c26aa58af813ae90a691667c4fa6022a08:0'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #ad94d9, #2a1240)',
    fade: '#2a1240',
    urns: ['urn:decentraland:matic:collections-v2:0xb0d0d31910da4a14d4e05a9d51b6e9a99a85d676:2']
  },
  {
    frame: 'linear-gradient(180deg, #ac938a, #513e3e)',
    fade: 'rgba(81, 62, 62, 0.8)',
    urns: ['urn:decentraland:matic:collections-v2:0x990191ee06ed5f5c138e39132a28a9afa0a20efc:0']
  },
  {
    frame: 'linear-gradient(180deg, #4cff19, #ceffc0)',
    fade: 'rgba(206, 255, 192, 0.8)',
    urns: [
      'urn:decentraland:matic:collections-v2:0x4521fac36b7947256119d3c1583fc470d31e5ee9:0',
      'urn:decentraland:matic:collections-v2:0x2cca599ea02d50397325996f85aacb631a24d4a6:0',
      'urn:decentraland:matic:collections-v2:0x08dc1667db12675e8cfb6e58ba30fe865d8c4bb6:0',
      'urn:decentraland:matic:collections-v2:0xeede64bfaf8055492aa500846ec7c6e6a9f533d5:0',
      'urn:decentraland:matic:collections-v2:0xba4ea586691655dbb3623320ca40d13e875fa37d:0',
      'urn:decentraland:matic:collections-v2:0x65cfb23fd782a3ff1b0db3a8ab98c8cc485d3653:1'
    ]
  },
  {
    frame: 'linear-gradient(180deg, #d8d8d8, #6bc1c0)',
    fade: 'rgba(107, 193, 192, 0.8)',
    urns: ['urn:decentraland:matic:collections-v2:0x6c3ca91dbac390d60d4267fdcf48576f6c051dbe:0']
  },
  {
    frame: 'linear-gradient(180deg, #161616, #002163)',
    fade: 'rgba(189, 58, 169, 0.8)',
    urns: ['urn:decentraland:matic:collections-v2:0x35a88018309c9ea212b8c152c11b2a08cd229728:0']
  }
]

const FALLBACK: Omit<Avatar, 'src'> = {
  frame: 'linear-gradient(180deg, #14161b, #2a2a2e)',
  fade: 'rgba(0, 0, 0, 0.8)',
  urns: []
}

export const AVATARS: Avatar[] = sources.map((src, i) => ({ src, ...(LOOKS[i] ?? FALLBACK) }))
