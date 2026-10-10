# Two measurements (10 Oct), on the real collection

Read-only, desktop Chromium, the table. To a thousandth of a pixel.

## The figure at 768

```json
{
 "drawn": true,
 "top": 286.703,
 "foot": 505.984,
 "left": 487,
 "right": 748,
 "width": 261,
 "height": 219.281,
 "blockTop": 286,
 "blockFoot": 506,
 "columnRight": 463,
 "contentRight": 748,
 "construction": {
  "width": 260.985,
  "height": 219.281,
  "unitWidth": 194,
  "unitHeight": 163
 },
 "solids": []
}
```

## A solid’s faces

| window | solids drawn | a solid, wide × tall | base face, wide | shade face, wide | top face, wide | narrowest |
|---|---|---|---|---|---|---|
| 1440 | 3 | 105.099 × 121.349 | 52.556 | 52.543 | 105.099 | 52.543 |
| 1024 | 3 | 56.701 × 65.474 | 28.344 | 28.357 | 56.701 | 28.344 |
| 900 | 3 | 29.14 × 33.661 | 14.563 | 14.577 | 29.14 | 14.563 |
| 840 | 3 | 15.805 × 18.261 | 7.909 | 7.896 | 15.805 | 7.896 |
| 830 | 3 | 13.591 × 15.697 | 6.802 | 6.789 | 13.591 | 6.789 |
| 825 | 3 | 12.485 × 14.415 | 6.249 | 6.236 | 12.485 | 6.236 |
| 824 | 3 | 12.255 × 14.158 | 6.128 | 6.128 | 12.255 | 6.128 |
| 823 | 3 | 12.039 × 13.902 | 6.02 | 6.02 | 12.039 | 6.02 |
| 822 | 0 | | | | | |
| 821 | 0 | | | | | |
| 820 | 0 | | | | | |

**Do not read the face columns as the rule.** At 823 and 824 the side
faces are half the solid's width; at 830, 1024 and 1440 one of the two
comes out 0.0065 below half and the other 0.0065 above (6.789 and 6.802
at 13.591; 28.344 and 28.357 at 56.701; 52.543 and 52.556 at 105.099).
The same absolute offset at 13.6 wide and at 105 wide is neither rounding
nor proportional: it is how the face was measured here, a polygon's client
box, which the browser snaps to its layout grid at the two faces' shared
edge. The rule is the geometry, held by `block-figure.test.ts`: each side
face is exactly half the solid's width, so a solid 12 wide has faces of 6.
