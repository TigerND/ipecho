
## IPEcho

Simple IP Echo Server

## Examples

```sh
curl -H "Accept: text/plain" http://ipecho.plexrayinc.com/
```

```js
$.ajax({
    url: "http://ipecho.plexrayinc.com/",
    headers: {"Accept": "application/json"}
}).done(function(data) {
    console.log("IP Address:", data)
})
```
