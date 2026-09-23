/**
 * **Every real record id in the collection, as one list.**
 *
 * The generator's properties — §5.5's area floor, §20's clearance, the 6:1
 * size band — are claims about the REAL sheet rather than about a sample, so
 * every test that checks one has to see the same seventeen.
 *
 * It lives here because it was copied instead. §20's first test carried
 * twelve of the seventeen and reported the worst record at 0.540% when it was
 * actually 0.440% with two still under the floor: the five it omitted were
 * the five worst, so the incomplete list did not merely test less, it
 * reported a pass that was not true. A shared constant cannot drift from
 * itself.
 */
export const REAL_RECORD_IDS = [
  'e73e1de1-3686-4a81-8544-ca2300e187bb',
  'd7047c62-149e-42fa-8cda-fac3f90c47cc',
  '158a3163-6a56-4673-8f88-27e7b2aec724',
  'c61c5919-8f50-4782-8e04-419fb3d2b148',
  'a31591e7-2e28-42e7-84d5-2a1f96ad31fd',
  'b9a9a9db-4bf5-42e6-b751-0eba2dfe8002',
  '30504952-8d43-4c2e-b687-b89558371df5',
  '78da2ee9-f7c7-40ea-8149-269454437ef6',
  '372aba39-59ad-46c8-b76b-f33ecae75c98',
  '464979c3-aaa2-43c5-afd4-8dc4ee2e98c6',
  '7d35194b-5a02-4e31-a568-d95a9b32b0cd',
  'b4abf39a-df33-4a9e-b65c-64d3d0a39b78',
  '4a1e2b7c-0000-4000-8000-000000000001',
  '4a1e2b7c-0000-4000-8000-000000000002',
  '4a1e2b7c-0000-4000-8000-000000000003',
  '4a1e2b7c-0000-4000-8000-000000000004',
  '4a1e2b7c-0000-4000-8000-000000000005'
] as const;
