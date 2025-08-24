<script lang="ts">
  import { autosize } from '../actions/autosize';
  import { viewContext } from '../stores';
  import { t } from '../lib/translations/translations';
  import type { LatestPromptDsl } from '../promptops/dsl/prompt/registry';
  let { input, inputStringRows, value, onchange, isInvalid } = $props<{ input: LatestPromptDsl['inputs'][number], inputStringRows: number, value: string | undefined, onchange: (name: string, value: string) => void, isInvalid: boolean }>();

  function handleChange(e: Event) :void{
    if (e.target instanceof HTMLSelectElement) {
      const v = e.target.value;
      onchange(input.name, v);
      return;
    } else if (e.target instanceof HTMLInputElement) {
      const v = (e.target as HTMLInputElement).value;
      onchange(input.name, v);
      return;
    }

    const v = (e.target as HTMLTextAreaElement).value;
    onchange(input.name, v);
  }
</script>

<label for="{input.name}">
  差し込み
  （{$t(`common.input-type-${input.type}-name`)}）：&#123;&#123;{input.name ?? ''}&#125;&#125;
  {#if input.required}
    <span class="text-red-500 ml-1">*</span>
  {/if}
</label> 

{#if input.type === 'number'} 
  <input 
    type="number" 
    id="{input.name}" 
    bind:value="{value}" 
    onchange={handleChange} 
    placeholder="{input.description ?? "差し込み数値の内容を入力してください。"}"
    class:border-red-500={isInvalid}/>
{:else if input.type === 'boolean'}
  <select id="{input.name}" bind:value="{value}" onchange={handleChange} class:border-red-500={isInvalid}>
    <option value="">{$t(`common.input-type-boolean-not-selected`)}{input.description ? `（${input.description}）` : ''}</option>
    <option value="true">{$t(`common.input-type-boolean-true`)}</option>
    <option value="false">{$t(`common.input-type-boolean-false`)}</option>
  </select>
{:else}
  <textarea 
    id="{input.name}" 
    bind:value="{value}" 
    onchange={handleChange}
    placeholder="{input.description ?? "差し込みテキストの内容を入力してください。"}"
    use:autosize={{ maxRows: 5, minRows: 2, fixedRows: $viewContext === 'popup' ? inputStringRows : undefined }}
    class:border-red-500={isInvalid}
  ></textarea>
{/if}
